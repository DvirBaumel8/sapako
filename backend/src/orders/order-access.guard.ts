import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class OrderAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orderId = request.params.id;
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    const allowed = await this.permissionsService.hasProviderAccess(
      request.user,
      order.providerId,
    );
    if (!allowed) {
      throw new ForbiddenException('No access to this order');
    }
    request.order = order;
    return true;
  }
}
