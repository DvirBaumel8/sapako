import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  BranchProvidersController,
  ProviderAdminController,
} from './providers.controller';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { Role } from '../users/role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BranchAccessGuard } from '../permissions/branch-access.guard';

// Unit-level companion to test/authorization.e2e-spec.ts: that file proves
// the guards behave correctly against a real request; this proves each
// route delegates to the service with the right arguments and carries the
// guard/role metadata that behavioural test relies on.
describe('BranchProvidersController', () => {
  let controller: BranchProvidersController;
  const mockProvidersService = {
    findActiveByBranch: jest.fn(),
    findAllForBranch: jest.fn(),
    create: jest.fn(),
  };
  const mockPermissionsService = {
    getAccessibleProviderIds: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BranchProvidersController(
      mockProvidersService as any,
      mockPermissionsService as any,
    );
  });

  describe('guards', () => {
    it('requires authentication and branch access for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, BranchProvidersController);
      expect(guards).toEqual([JwtAuthGuard, BranchAccessGuard, RolesGuard]);
    });

    it('leaves the accessible-providers listing open to any authenticated role', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        BranchProvidersController.prototype.findForBranch,
      );
      expect(roles).toBeUndefined();
    });

    it('restricts the unfiltered listing to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        BranchProvidersController.prototype.findAllForBranch,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('restricts creating a provider to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        BranchProvidersController.prototype.create,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('findForBranch', () => {
    it('resolves accessible provider ids and delegates with them', async () => {
      mockPermissionsService.getAccessibleProviderIds.mockResolvedValue(['p1']);
      const providers = [{ id: 'p1' }];
      mockProvidersService.findActiveByBranch.mockResolvedValue(providers);
      const req = { user: { userId: 'staff1', role: Role.STAFF } };

      const result = await controller.findForBranch(req, 'b1');

      expect(mockPermissionsService.getAccessibleProviderIds).toHaveBeenCalledWith(
        req.user,
      );
      expect(mockProvidersService.findActiveByBranch).toHaveBeenCalledWith('b1', [
        'p1',
      ]);
      expect(result).toBe(providers);
    });
  });

  describe('findAllForBranch', () => {
    it('delegates to the service with the branch id', async () => {
      const providers = [{ id: 'p1' }, { id: 'p2' }];
      mockProvidersService.findAllForBranch.mockResolvedValue(providers);

      const result = await controller.findAllForBranch('b1');

      expect(mockProvidersService.findAllForBranch).toHaveBeenCalledWith('b1');
      expect(result).toBe(providers);
    });
  });

  describe('create', () => {
    it('delegates to the service with the branch id and dto', async () => {
      const dto: CreateProviderDto = {
        name: 'תנובה',
        phone: '0500000000',
        departmentIds: ['d1'],
      };
      const created = { id: 'p1', ...dto };
      mockProvidersService.create.mockResolvedValue(created);

      const result = await controller.create('b1', dto);

      expect(mockProvidersService.create).toHaveBeenCalledWith('b1', dto);
      expect(result).toBe(created);
    });
  });
});

describe('ProviderAdminController', () => {
  let controller: ProviderAdminController;
  const mockProvidersService = {
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProviderAdminController(mockProvidersService as any);
  });

  describe('guards', () => {
    it('requires authentication for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, ProviderAdminController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('restricts updating a provider to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderAdminController.prototype.update,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('restricts removing a provider to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderAdminController.prototype.remove,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('update', () => {
    it('delegates to the service with the id and dto', async () => {
      const dto: UpdateProviderDto = { name: 'תנובה בע"מ' };
      const updated = { id: 'p1', name: 'תנובה בע"מ' };
      mockProvidersService.update.mockResolvedValue(updated);

      const result = await controller.update('p1', dto);

      expect(mockProvidersService.update).toHaveBeenCalledWith('p1', dto);
      expect(result).toBe(updated);
    });
  });

  describe('remove', () => {
    it('delegates to the service with the id', async () => {
      mockProvidersService.remove.mockResolvedValue(undefined);

      await controller.remove('p1');

      expect(mockProvidersService.remove).toHaveBeenCalledWith('p1');
    });
  });
});
