import {
  Body,
  Controller,
  Get,
  Logger,
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
import { WhatsAppAttemptDto } from './dto/whatsapp-attempt.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

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
    return this.ordersService.updateItem(orderId, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(OrderAccessGuard)
  removeItem(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    return this.ordersService.removeItem(orderId, itemId);
  }

  /**
   * Records that WhatsApp was opened for this order.
   *
   * Superseded /publish, which is kept below because the app is a PWA served
   * by a service worker: a client running a cached shell from before this
   * deploy still calls the old route, and removing it would break their
   * ordering the moment the backend shipped.
   */
  @Post(':id/handoff')
  @UseGuards(OrderAccessGuard)
  handOff(@Param('id') orderId: string): Promise<Order> {
    return this.ordersService.handOff(orderId);
  }

  /**
   * Privacy-safe client telemetry for the browser-to-WhatsApp handoff.
   * Render retains this structured record without receiving order text or a
   * supplier phone number, both of which would be unnecessary sensitive data.
   */
  @Post(':id/whatsapp-attempt')
  @UseGuards(OrderAccessGuard)
  recordWhatsAppAttempt(
    @Param('id') orderId: string,
    @Body() dto: WhatsAppAttemptDto,
  ): { attemptId: string } {
    this.logger.log(
      JSON.stringify({
        event: 'whatsapp_handoff',
        orderId,
        attemptId: dto.attemptId,
        stage: dto.stage,
        clientMode: dto.clientMode,
      }),
    );
    return { attemptId: dto.attemptId };
  }

  @Post(':id/confirm')
  @UseGuards(OrderAccessGuard)
  confirmSent(@Param('id') orderId: string): Promise<Order> {
    return this.ordersService.confirmSent(orderId);
  }

  @Post(':id/revert')
  @UseGuards(OrderAccessGuard)
  revertToDraft(@Param('id') orderId: string): Promise<Order> {
    return this.ordersService.revertToDraft(orderId);
  }

  /** @deprecated Superseded by handoff + confirm. See handOff() above. */
  @Post(':id/publish')
  @UseGuards(OrderAccessGuard)
  publish(@Param('id') orderId: string): Promise<Order> {
    return this.ordersService.publish(orderId);
  }

  @Delete(':id')
  @UseGuards(OrderAccessGuard)
  remove(@Param('id') orderId: string): Promise<void> {
    return this.ordersService.remove(orderId);
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

  /**
   * The orders this branch handed to WhatsApp and has not answered for yet.
   *
   * Served from the database rather than remembered on the device: the user
   * may confirm from a different phone, after a reload, or after the service
   * worker updated, and an order nobody answered for must keep asking.
   */
  @Get('awaiting-confirmation')
  async findAwaiting(
    @Req() req: any,
    @Param('branchId') branchId: string,
  ): Promise<Order[]> {
    const accessibleProviderIds =
      await this.permissionsService.getAccessibleProviderIds(req.user);
    return this.ordersService.findAwaitingConfirmation(
      branchId,
      accessibleProviderIds,
    );
  }
}
