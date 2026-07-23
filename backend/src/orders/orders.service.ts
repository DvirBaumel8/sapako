import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from './order-status.enum';
import { ProvidersService } from '../providers/providers.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
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

  async findByBranch(branchId: string): Promise<Order[]> {
    return this.orderRepo.find({
      where: { branchId },
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
    const order = await this.getDraftOrThrow(orderId);

    let productNameSnapshot = input.productNameSnapshot;
    let unitType = input.unitType;

    if (input.productId) {
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

    const entity = this.orderItemRepo.create({
      orderId,
      productId: input.productId,
      productNameSnapshot,
      unitType,
      quantity: input.quantity,
    });
    return this.orderItemRepo.save(entity);
  }

  async updateItemQuantity(
    orderId: string,
    itemId: string,
    quantity: number,
  ): Promise<OrderItem> {
    await this.getDraftOrThrow(orderId);
    const item = await this.orderItemRepo.findOne({
      where: { id: itemId, orderId },
    });
    if (!item) {
      throw new NotFoundException('Order item not found');
    }
    item.quantity = quantity;
    return this.orderItemRepo.save(item);
  }

  async removeItem(orderId: string, itemId: string): Promise<void> {
    await this.getDraftOrThrow(orderId);
    await this.orderItemRepo.delete({ id: itemId, orderId });
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

  private async getDraftOrThrow(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.DRAFT) {
      throw new ConflictException('Order is no longer a draft');
    }
    return order;
  }
}
