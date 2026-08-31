import { Module } from '@nestjs/common';
import { OrderNotifierService } from './order-notifier.service';

@Module({
  providers: [OrderNotifierService],
  exports: [OrderNotifierService],
})
export class NotificationsModule {}
