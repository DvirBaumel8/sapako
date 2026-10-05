import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  ProviderCategoriesController,
  CategoryAdminController,
} from './categories.controller';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Role } from '../users/role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ProviderAccessGuard } from '../permissions/provider-access.guard';

describe('ProviderCategoriesController', () => {
  let controller: ProviderCategoriesController;
  const mockCategoriesService = {
    findAllForProvider: jest.fn(),
    create: jest.fn(),
  };
  const mockPermissionsService = { assertCanEditProducts: jest.fn() };
  const req = { user: { userId: 'u1', role: Role.STAFF } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionsService.assertCanEditProducts.mockResolvedValue(undefined);
    controller = new ProviderCategoriesController(
      mockCategoriesService as any,
      mockPermissionsService as any,
    );
  });

  describe('guards', () => {
    it('requires authentication and provider access for the whole controller', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ProviderCategoriesController,
      );
      expect(guards).toEqual([JwtAuthGuard, ProviderAccessGuard, RolesGuard]);
    });

    it('has no @Roles on creating a category; the permission check is explicit', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderCategoriesController.prototype.create,
      );
      expect(roles).toBeUndefined();
    });

    it('leaves listing open to any authenticated role with provider access', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderCategoriesController.prototype.findForProvider,
      );
      expect(roles).toBeUndefined();
    });
  });

  describe('findForProvider', () => {
    it('delegates to the service with the provider id', async () => {
      const categories = [{ id: 'c1' }];
      mockCategoriesService.findAllForProvider.mockResolvedValue(categories);

      const result = await controller.findForProvider('p1');

      expect(mockCategoriesService.findAllForProvider).toHaveBeenCalledWith(
        'p1',
      );
      expect(result).toBe(categories);
    });
  });

  describe('create', () => {
    it('delegates to the service with the provider id and dto', async () => {
      const dto: CreateCategoryDto = { name: 'גבינות' };
      const created = { id: 'c1', name: 'גבינות' };
      mockCategoriesService.create.mockResolvedValue(created);

      const result = await controller.create(req, 'p1', dto);

      expect(mockPermissionsService.assertCanEditProducts).toHaveBeenCalledWith(
        req.user,
        'p1',
      );
      expect(mockCategoriesService.create).toHaveBeenCalledWith('p1', dto);
      expect(result).toBe(created);
    });

    it('does not create when the permission check rejects', async () => {
      mockPermissionsService.assertCanEditProducts.mockRejectedValue(
        new Error('forbidden'),
      );

      await expect(
        controller.create(req, 'p1', { name: 'גבינות' }),
      ).rejects.toThrow('forbidden');
      expect(mockCategoriesService.create).not.toHaveBeenCalled();
    });
  });
});

describe('CategoryAdminController', () => {
  let controller: CategoryAdminController;
  const mockCategoriesService = {
    findById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const mockPermissionsService = { assertCanEditProducts: jest.fn() };
  const req = { user: { userId: 'u1', role: Role.STAFF } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionsService.assertCanEditProducts.mockResolvedValue(undefined);
    mockCategoriesService.findById.mockResolvedValue({
      id: 'c1',
      providerId: 'p9',
    });
    controller = new CategoryAdminController(
      mockCategoriesService as any,
      mockPermissionsService as any,
    );
  });

  describe('guards', () => {
    it('requires authentication for the whole controller', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        CategoryAdminController,
      );
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('has no @Roles on updating a category; the permission check is explicit', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        CategoryAdminController.prototype.update,
      );
      expect(roles).toBeUndefined();
    });

    it('has no @Roles on removing a category; the permission check is explicit', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        CategoryAdminController.prototype.remove,
      );
      expect(roles).toBeUndefined();
    });
  });

  describe('update', () => {
    it('delegates to the service with the id and dto', async () => {
      const dto: UpdateCategoryDto = { name: 'גבינות ומעדנים' };
      const updated = { id: 'c1', name: 'גבינות ומעדנים' };
      mockCategoriesService.update.mockResolvedValue(updated);

      const result = await controller.update(req, 'c1', dto);

      expect(mockPermissionsService.assertCanEditProducts).toHaveBeenCalledWith(
        req.user,
        'p9',
      );
      expect(mockCategoriesService.update).toHaveBeenCalledWith('c1', dto);
      expect(result).toBe(updated);
    });

    it('does not update when the permission check rejects', async () => {
      mockPermissionsService.assertCanEditProducts.mockRejectedValue(
        new Error('forbidden'),
      );

      await expect(controller.update(req, 'c1', { name: 'x' })).rejects.toThrow(
        'forbidden',
      );
      expect(mockCategoriesService.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('delegates to the service with the id', async () => {
      mockCategoriesService.remove.mockResolvedValue(undefined);

      await controller.remove(req, 'c1');

      expect(mockPermissionsService.assertCanEditProducts).toHaveBeenCalledWith(
        req.user,
        'p9',
      );
      expect(mockCategoriesService.remove).toHaveBeenCalledWith('c1');
    });

    it('does not remove when the permission check rejects', async () => {
      mockPermissionsService.assertCanEditProducts.mockRejectedValue(
        new Error('forbidden'),
      );

      await expect(controller.remove(req, 'c1')).rejects.toThrow('forbidden');
      expect(mockCategoriesService.remove).not.toHaveBeenCalled();
    });
  });
});
