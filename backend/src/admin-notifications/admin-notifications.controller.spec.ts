import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminNotificationsController } from './admin-notifications.controller';
import { Role } from '../users/role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('AdminNotificationsController', () => {
  let controller: AdminNotificationsController;
  const mockService = {
    listForUser: jest.fn(),
    countUnread: jest.fn(),
    markRead: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminNotificationsController(mockService as any);
  });

  describe('guards', () => {
    // Admin-only end to end: a notification reveals which order an
    // employee sent and links straight into it, so a missing guard here
    // would leak that to any authenticated staff account.
    it('requires authentication and the ADMIN role for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AdminNotificationsController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);

      const roles = Reflect.getMetadata(ROLES_KEY, AdminNotificationsController);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('findAll', () => {
    it("lists the caller's own notifications", async () => {
      const req = { user: { userId: 'admin-1' } };
      mockService.listForUser.mockResolvedValue([]);

      await controller.findAll(req);

      expect(mockService.listForUser).toHaveBeenCalledWith('admin-1', {
        offset: undefined,
        limit: undefined,
      });
    });

    it('parses offset and limit query params to numbers', async () => {
      const req = { user: { userId: 'admin-1' } };
      mockService.listForUser.mockResolvedValue([]);

      await controller.findAll(req, '20', '10');

      expect(mockService.listForUser).toHaveBeenCalledWith('admin-1', {
        offset: 20,
        limit: 10,
      });
    });
  });

  describe('unreadCount', () => {
    it("returns the caller's unread count", async () => {
      const req = { user: { userId: 'admin-1' } };
      mockService.countUnread.mockResolvedValue(4);

      const result = await controller.unreadCount(req);

      expect(mockService.countUnread).toHaveBeenCalledWith('admin-1');
      expect(result).toEqual({ count: 4 });
    });
  });

  describe('markRead', () => {
    it("delegates to the service, scoped to the caller's own notification", () => {
      const req = { user: { userId: 'admin-1' } };

      controller.markRead(req, 'n1');

      expect(mockService.markRead).toHaveBeenCalledWith('n1', 'admin-1');
    });
  });

  describe('remove', () => {
    it("delegates to the service, scoped to the caller's own notification", () => {
      const req = { user: { userId: 'admin-1' } };

      controller.remove(req, 'n1');

      expect(mockService.remove).toHaveBeenCalledWith('n1', 'admin-1');
    });
  });
});
