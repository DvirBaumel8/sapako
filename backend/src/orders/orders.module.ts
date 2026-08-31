import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrdersService } from './orders.service';
import { OrdersController, BranchOrdersController } from './orders.controller';
import { OrderAccessGuard } from './order-access.guard';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProvidersModule } from '../providers/providers.module';
import { ProductsModule } from '../products/products.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    PermissionsModule,
    ProvidersModule,
    ProductsModule,
    NotificationsModule,
  ],
  providers: [OrdersService, OrderAccessGuard],
  controllers: [OrdersController, BranchOrdersController],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
