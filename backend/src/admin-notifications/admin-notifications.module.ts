import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminNotification } from './admin-notification.entity';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsGateway } from './admin-notifications.gateway';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([AdminNotification]), UsersModule, AuthModule],
  providers: [AdminNotificationsService, AdminNotificationsGateway],
  controllers: [AdminNotificationsController],
  exports: [AdminNotificationsService],
})
export class AdminNotificationsModule {}
