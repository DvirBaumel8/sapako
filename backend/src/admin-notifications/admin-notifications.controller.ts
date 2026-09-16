import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../users/role.enum';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminNotification } from './admin-notification.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: AdminNotificationsService,
  ) {}

  @Get()
  findAll(
    @Req() req: any,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminNotification[]> {
    return this.notificationsService.listForUser(req.user.userId, {
      offset: offset ? Number(offset) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('unread-count')
  async unreadCount(@Req() req: any): Promise<{ count: number }> {
    const count = await this.notificationsService.countUnread(req.user.userId);
    return { count };
  }

  @Patch(':id/read')
  markRead(@Req() req: any, @Param('id') id: string): Promise<void> {
    return this.notificationsService.markRead(id, req.user.userId);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string): Promise<void> {
    return this.notificationsService.remove(id, req.user.userId);
  }
}
