import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from './order-status.enum';
import { isWeightUnit } from '../products/unit-types';
import { ProvidersService } from '../providers/providers.service';
import { ProductsService } from '../products/products.service';
import { OrderNotifierService } from '../notifications/order-notifier.service';

/**
 * How many recent orders the activity list returns.
 *
 * The query was previously unbounded, so it grew with every order the branch
 * had ever placed — each one joined to all of its items. A shop ordering
 * daily would eventually be downloading months of history to render a screen
 * called "recent activity".
 *
 * The one thing this bounds that callers still care about is resuming a
 * draft: a draft older than this many orders will no longer be offered.
 */
export const RECENT_ORDER_LIMIT = 200;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly providersService: ProvidersService,
    private readonly productsService: ProductsService,
    private readonly orderNotifier: OrderNotifierService,
  ) {}

  async createDraft(
    userId: string,
    input: { branchId: string; providerId: string },
  ): Promise<Order> {
    const provider = await this.providersService.findById(input.providerId);
    if (provider.branchId !== input.branchId) {
      throw new BadRequestException(
        'Provider does not belong to the given branch',
      );
    }
    const entity = this.orderRepo.create({
      branchId: input.branchId,
      providerId: input.providerId,
      createdByUserId: userId,
      status: OrderStatus.DRAFT,
    });
    return this.orderRepo.save(entity);
  }

  async findById(id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: { items: true, provider: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async findByBranch(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
  ): Promise<Order[]> {
    const where: FindOptionsWhere<Order> = { branchId };
    if (accessibleProviderIds !== 'ALL') {
      where.providerId = In(accessibleProviderIds);
    }
    const orders = await this.orderRepo.find({
      where,
      relations: { items: true, provider: true },
      order: { createdAt: 'DESC' },
      take: RECENT_ORDER_LIMIT,
    });
    // Both screens that read this list discard empty orders, so shipping them
    // is pure transfer cost on a connection that may be slow.
    return orders.filter((order) => order.items.length > 0);
  }

  async addItem(
    orderId: string,
    input: {
      productId?: string;
      productNameSnapshot?: string;
      unitType?: string;
      quantity: number;
    },
  ): Promise<OrderItem> {
    return this.withDraftOrder(orderId, async (order, manager) => {
      let productNameSnapshot = input.productNameSnapshot;
      let unitType = input.unitType;

      if (input.productId) {
        // Not part of the order-row lock: it reads the (unrelated) products
        // table and doesn't need to participate in the transaction.
        const product = await this.productsService.findById(input.productId);
        if (product.providerId !== order.providerId) {
          throw new BadRequestException(
            "Product does not belong to this order's provider",
          );
        }
        productNameSnapshot = product.name;
        unitType = unitType ?? product.unitType;
      }

      if (!productNameSnapshot || !unitType) {
        throw new BadRequestException(
          'productNameSnapshot and unitType are required for ad-hoc items',
        );
      }

      const itemRepo = manager.getRepository(OrderItem);
      const entity = itemRepo.create({
        orderId,
        productId: input.productId,
        productNameSnapshot,
        unitType,
        quantity: input.quantity,
      });
      return itemRepo.save(entity);
    });
  }

  /**
   * Changes the quantity, the unit, or both, for one line of a draft order.
   *
   * The unit is held per item rather than per product: ordering one delivery
   * of something by weight is a decision about that order, and must not
   * rewrite the catalogue for every branch and every future order.
   */
  async updateItem(
    orderId: string,
    itemId: string,
    changes: { quantity?: number; unitType?: string },
  ): Promise<OrderItem> {
    if (changes.quantity === undefined && changes.unitType === undefined) {
      throw new BadRequestException('Provide a quantity, a unitType, or both');
    }
    return this.withDraftOrder(orderId, async (_order, manager) => {
      const itemRepo = manager.getRepository(OrderItem);
      const item = await itemRepo.findOne({ where: { id: itemId, orderId } });
      if (!item) {
        throw new NotFoundException('Order item not found');
      }
      if (changes.unitType !== undefined) {
        item.unitType = changes.unitType;
      }
      if (changes.quantity !== undefined) {
        item.quantity = changes.quantity;
      }

      // A counted unit cannot hold a fraction: 2.5 kg switched to cartons has
      // to resolve to whole ones. Rounds rather than truncates, and never to
      // zero, so switching the unit can neither shrink an order to nothing
      // nor write a quantity the add/update endpoints would reject.
      if (!isWeightUnit(item.unitType) && !Number.isInteger(item.quantity)) {
        item.quantity = Math.max(1, Math.round(item.quantity));
      }

      return itemRepo.save(item);
    });
  }

  async removeItem(orderId: string, itemId: string): Promise<void> {
    await this.withDraftOrder(orderId, async (_order, manager) => {
      const result = await manager.delete(OrderItem, { id: itemId, orderId });
      if (result.affected === 0) {
        throw new NotFoundException('Order item not found');
      }
    });
  }

  async remove(orderId: string): Promise<void> {
    // Deletion is allowed regardless of status (unlike item mutations, which
    // are DRAFT-only to protect an already-published order's contents) —
    // this just clears an unwanted history entry. order_items cascades via
    // its FK, so no explicit item cleanup is needed here.
    const result = await this.orderRepo.delete({ id: orderId });
    if (result.affected === 0) {
      throw new NotFoundException('Order not found');
    }
  }

  /**
   * DRAFT -> AWAITING_CONFIRMATION, recording that WhatsApp was opened.
   *
   * This is as far as the app can get on its own. Whether the message left
   * the device is something only the user can report, via confirmSent() or
   * revertToDraft().
   */
  async handOff(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Same atomic conditional UPDATE as publish(): only a row still in DRAFT
    // matches, so a double-tap cannot hand off twice.
    const result = await this.orderRepo.update(
      { id: orderId, status: OrderStatus.DRAFT },
      { status: OrderStatus.AWAITING_CONFIRMATION, handedOffAt: new Date() },
    );
    if (result.affected === 0) {
      throw new ConflictException('Order is no longer a draft');
    }

    return this.findById(orderId);
  }

  /** AWAITING_CONFIRMATION -> PUBLISHED, on the user's word that it was sent. */
  async confirmSent(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const result = await this.orderRepo.update(
      { id: orderId, status: OrderStatus.AWAITING_CONFIRMATION },
      { status: OrderStatus.PUBLISHED, publishedAt: new Date() },
    );
    if (result.affected === 0) {
      throw new ConflictException('Order is not awaiting confirmation');
    }

    const confirmed = await this.findById(orderId);
    await this.sendRecordEmail(confirmed);
    return this.findById(orderId);
  }

  /**
   * AWAITING_CONFIRMATION -> DRAFT, when the user says the message never
   * went out. Clears the handoff time so a later, real send is not recorded
   * as having happened earlier.
   */
  async revertToDraft(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const result = await this.orderRepo.update(
      { id: orderId, status: OrderStatus.AWAITING_CONFIRMATION },
      { status: OrderStatus.DRAFT, handedOffAt: null },
    );
    if (result.affected === 0) {
      throw new ConflictException('Order is not awaiting confirmation');
    }

    return this.findById(orderId);
  }

  /** Returns the orders this branch is still waiting to hear about. */
  async findAwaitingConfirmation(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
  ): Promise<Order[]> {
    const where: FindOptionsWhere<Order> = {
      branchId,
      status: OrderStatus.AWAITING_CONFIRMATION,
    };
    if (accessibleProviderIds !== 'ALL') {
      where.providerId = In(accessibleProviderIds);
    }
    return this.orderRepo.find({
      where,
      relations: { items: true, provider: true },
      order: { handedOffAt: 'ASC' },
    });
  }

  /**
   * Emails the confirmed order as a record, then notes that it went.
   *
   * Deliberately swallows every failure. The message has already reached the
   * supplier by the time this runs, so turning a mail outage into a failed
   * confirmation would leave the user staring at an error for something that
   * worked, and tempt them to send the order twice.
   */
  private async sendRecordEmail(order: Order): Promise<void> {
    try {
      const sent = await this.orderNotifier.sendOrderPublished(order);
      if (sent) {
        await this.orderRepo.update(
          { id: order.id },
          { notificationSentAt: new Date() },
        );
      }
    } catch {
      // notificationSentAt stays null, which is the signal that it failed.
    }
  }

  async publish(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.PUBLISHED) {
      throw new ConflictException('Order has already been published');
    }

    // Atomic conditional UPDATE: only a row still in DRAFT status matches,
    // so under concurrent publish() calls (double-tap, retry) at most one
    // caller's UPDATE affects a row. The loser sees affected === 0 and gets
    // a clean 409 instead of silently double-publishing.
    const result = await this.orderRepo.update(
      { id: orderId, status: OrderStatus.DRAFT },
      { status: OrderStatus.PUBLISHED, publishedAt: new Date() },
    );
    if (result.affected === 0) {
      throw new ConflictException('Order has already been published');
    }

    return this.findById(orderId);
  }

  /**
   * Runs `work` inside a transaction holding a pessimistic write lock on the
   * order row, after verifying the order exists and is still DRAFT.
   *
   * This is what makes item mutations safe against a concurrent publish():
   * publish() commits its DRAFT->PUBLISHED UPDATE atomically against the
   * same row, so Postgres serializes the two. Whichever transaction (this
   * one or publish()'s) commits first wins; the other either blocks until
   * the first commits and then sees the up-to-date status (and 409s here if
   * it lost), or — if it truly started first — completes safely before
   * publish() can flip the status. Without the lock, addItem/updateItem/
   * removeItem could read DRAFT, have publish() commit PUBLISHED in
   * between, and then still write, silently mutating an order that's
   * already been handed off to WhatsApp.
   */
  private async withDraftOrder<T>(
    orderId: string,
    work: (order: Order, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.orderRepo.manager.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.DRAFT) {
        throw new ConflictException('Order is no longer a draft');
      }
      return work(order, manager);
    });
  }
}
