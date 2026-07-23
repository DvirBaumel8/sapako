import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProviderAccessGuard } from '../permissions/provider-access.guard';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { OrderAccessGuard } from './order-access.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(ProviderAccessGuard)
  create(@Req() req: any, @Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.createDraft(req.user.userId, dto);
  }

  @Post(':id/items')
  @UseGuards(OrderAccessGuard)
  addItem(
    @Param('id') orderId: string,
    @Body() dto: AddOrderItemDto,
  ): Promise<OrderItem> {
    return this.ordersService.addItem(orderId, dto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(OrderAccessGuard)
  updateItem(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ): Promise<OrderItem> {
    return this.ordersService.updateItemQuantity(orderId, itemId, dto.quantity);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(OrderAccessGuard)
  removeItem(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    return this.ordersService.removeItem(orderId, itemId);
  }

  @Post(':id/publish')
  @UseGuards(OrderAccessGuard)
  publish(@Param('id') orderId: string): Promise<Order> {
    return this.ordersService.publish(orderId);
  }
}

@Controller('branches/:branchId/orders')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class BranchOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findForBranch(
    @Req() req: any,
    @Param('branchId') branchId: string,
  ): Promise<Order[]> {
    const accessibleProviderIds =
      await this.permissionsService.getAccessibleProviderIds(req.user);
    return this.ordersService.findByBranch(branchId, accessibleProviderIds);
  }
}
