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
import { ProvidersService } from '../providers/providers.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly providersService: ProvidersService,
    private readonly productsService: ProductsService,
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
    return this.orderRepo.find({
      where,
      relations: { items: true, provider: true },
      order: { createdAt: 'DESC' },
    });
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

  async updateItemQuantity(
    orderId: string,
    itemId: string,
    quantity: number,
  ): Promise<OrderItem> {
    return this.withDraftOrder(orderId, async (_order, manager) => {
      const itemRepo = manager.getRepository(OrderItem);
      const item = await itemRepo.findOne({ where: { id: itemId, orderId } });
      if (!item) {
        throw new NotFoundException('Order item not found');
      }
      item.quantity = quantity;
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
