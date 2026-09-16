import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminNotification } from './admin-notification.entity';
import { UsersService } from '../users/users.service';
import { AdminNotificationsGateway } from './admin-notifications.gateway';
import { Order } from '../orders/order.entity';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class AdminNotificationsService {
  constructor(
    @InjectRepository(AdminNotification)
    private readonly notificationsRepo: Repository<AdminNotification>,
    private readonly usersService: UsersService,
    private readonly gateway: AdminNotificationsGateway,
  ) {}

  /**
   * One row per current admin, not one shared row — so each admin's
   * read/deleted state is independently theirs with no join required.
   * Called from OrdersService.handOff, never from confirmSent: opening
   * WhatsApp is the "an employee sent an order" moment this feature is
   * for, not the later, separate confirmation that it actually went out.
   */
  async notifyAdmins(order: Order): Promise<void> {
    const admins = await this.usersService.findAdmins();
    if (admins.length === 0) return;
    await this.notificationsRepo.save(
      admins.map((admin) => ({ userId: admin.id, orderId: order.id })),
    );
    this.gateway.broadcastNew(order.provider.name);
  }

  listForUser(
    userId: string,
    { offset = 0, limit = DEFAULT_PAGE_SIZE }: { offset?: number; limit?: number } = {},
  ): Promise<AdminNotification[]> {
    return this.notificationsRepo.find({
      where: { userId },
      relations: { order: { provider: true, items: true } },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
  }

  countUnread(userId: string): Promise<number> {
    return this.notificationsRepo.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string): Promise<void> {
    const result = await this.notificationsRepo.update(
      { id, userId },
      { isRead: true },
    );
    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.notificationsRepo.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }
}
