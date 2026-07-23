import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  const mockUsersService = {
    findAllWithAccess: jest.fn(),
    toSafeUser: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  };
  const mockPermissionsService = {
    grant: jest.fn(),
    revoke: jest.fn(),
  };
  const mockProvidersService = {
    findById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(
      mockUsersService as any,
      mockPermissionsService as any,
      mockProvidersService as any,
    );
  });

  describe('grantAccess', () => {
    it('grants access when both the user and provider exist', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'u1' });
      mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
      mockPermissionsService.grant.mockResolvedValue({
        userId: 'u1',
        providerId: 'p1',
      });

      const result = await controller.grantAccess('u1', { providerId: 'p1' });

      expect(mockUsersService.findById).toHaveBeenCalledWith('u1');
      expect(mockProvidersService.findById).toHaveBeenCalledWith('p1');
      expect(mockPermissionsService.grant).toHaveBeenCalledWith('u1', 'p1');
      expect(result).toEqual({ userId: 'u1', providerId: 'p1' });
    });

    it('rejects with NotFoundException when the provider does not exist, without granting', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'u1' });
      mockProvidersService.findById.mockRejectedValue(
        new NotFoundException('Provider not found'),
      );

      await expect(
        controller.grantAccess('u1', { providerId: 'missing' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPermissionsService.grant).not.toHaveBeenCalled();
    });

    it('rejects with NotFoundException when the user does not exist, without checking the provider or granting', async () => {
      mockUsersService.findById.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        controller.grantAccess('missing', { providerId: 'p1' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockProvidersService.findById).not.toHaveBeenCalled();
      expect(mockPermissionsService.grant).not.toHaveBeenCalled();
    });
  });
});
