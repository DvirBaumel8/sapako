import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminNotification } from './admin-notification.entity';
import { UsersService } from '../users/users.service';
import { AdminNotificationsGateway } from './admin-notifications.gateway';

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;
  const notificationsRepo = {
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const usersService = { findAdmins: jest.fn() };
  const gateway = { broadcastNew: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        {
          provide: getRepositoryToken(AdminNotification),
          useValue: notificationsRepo,
        },
        { provide: UsersService, useValue: usersService },
        { provide: AdminNotificationsGateway, useValue: gateway },
      ],
    }).compile();
    service = module.get(AdminNotificationsService);
  });

  describe('notifyAdmins', () => {
    it('creates one row per current admin', async () => {
      usersService.findAdmins.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ]);

      await service.notifyAdmins({
        id: 'order-1',
        provider: { name: 'תנובה' },
      } as any);

      expect(notificationsRepo.save).toHaveBeenCalledWith([
        { userId: 'admin-1', orderId: 'order-1' },
        { userId: 'admin-2', orderId: 'order-1' },
      ]);
    });

    it('broadcasts the provider name to connected admins', async () => {
      usersService.findAdmins.mockResolvedValue([{ id: 'admin-1' }]);

      await service.notifyAdmins({
        id: 'order-1',
        provider: { name: 'תנובה' },
      } as any);

      expect(gateway.broadcastNew).toHaveBeenCalledWith('תנובה');
    });

    it('does nothing when there are no admins', async () => {
      usersService.findAdmins.mockResolvedValue([]);

      await service.notifyAdmins({ id: 'order-1', provider: { name: 'x' } } as any);

      expect(notificationsRepo.save).not.toHaveBeenCalled();
      expect(gateway.broadcastNew).not.toHaveBeenCalled();
    });
  });

  describe('listForUser', () => {
    it('lists only this user\'s notifications, newest first', async () => {
      notificationsRepo.find.mockResolvedValue([]);

      await service.listForUser('admin-1');

      expect(notificationsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'admin-1' },
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('defaults to a page of 20, offset 0', async () => {
      notificationsRepo.find.mockResolvedValue([]);

      await service.listForUser('admin-1');

      expect(notificationsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('honours an explicit offset and limit, for scrolling further pages', async () => {
      notificationsRepo.find.mockResolvedValue([]);

      await service.listForUser('admin-1', { offset: 20, limit: 10 });

      expect(notificationsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('countUnread', () => {
    it('counts only this user\'s unread notifications', async () => {
      notificationsRepo.count.mockResolvedValue(3);

      const result = await service.countUnread('admin-1');

      expect(notificationsRepo.count).toHaveBeenCalledWith({
        where: { userId: 'admin-1', isRead: false },
      });
      expect(result).toBe(3);
    });
  });

  describe('markRead', () => {
    it('marks only a notification owned by this user', async () => {
      notificationsRepo.update.mockResolvedValue({ affected: 1 });

      await service.markRead('n1', 'admin-1');

      expect(notificationsRepo.update).toHaveBeenCalledWith(
        { id: 'n1', userId: 'admin-1' },
        { isRead: true },
      );
    });

    it("rejects marking a notification that isn't this user's", async () => {
      // Scoping the WHERE by userId, not just id, is what stops one admin
      // from marking (or, worse, deleting) another admin's notification —
      // there is no separate ownership check, this update simply matches
      // zero rows for anyone else's id.
      notificationsRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.markRead('n1', 'admin-2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes only a notification owned by this user', async () => {
      notificationsRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove('n1', 'admin-1');

      expect(notificationsRepo.delete).toHaveBeenCalledWith({
        id: 'n1',
        userId: 'admin-1',
      });
    });

    it("rejects deleting a notification that isn't this user's", async () => {
      notificationsRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('n1', 'admin-2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
