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

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProviderCategoriesController(mockCategoriesService as any);
  });

  describe('guards', () => {
    it('requires authentication and provider access for the whole controller', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ProviderCategoriesController,
      );
      expect(guards).toEqual([JwtAuthGuard, ProviderAccessGuard, RolesGuard]);
    });

    it('restricts creating a category to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderCategoriesController.prototype.create,
      );
      expect(roles).toEqual([Role.ADMIN]);
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

      expect(mockCategoriesService.findAllForProvider).toHaveBeenCalledWith('p1');
      expect(result).toBe(categories);
    });
  });

  describe('create', () => {
    it('delegates to the service with the provider id and dto', async () => {
      const dto: CreateCategoryDto = { name: 'גבינות' };
      const created = { id: 'c1', name: 'גבינות' };
      mockCategoriesService.create.mockResolvedValue(created);

      const result = await controller.create('p1', dto);

      expect(mockCategoriesService.create).toHaveBeenCalledWith('p1', dto);
      expect(result).toBe(created);
    });
  });
});

describe('CategoryAdminController', () => {
  let controller: CategoryAdminController;
  const mockCategoriesService = {
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CategoryAdminController(mockCategoriesService as any);
  });

  describe('guards', () => {
    it('requires authentication for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, CategoryAdminController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('restricts updating a category to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        CategoryAdminController.prototype.update,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('restricts removing a category to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        CategoryAdminController.prototype.remove,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('update', () => {
    it('delegates to the service with the id and dto', async () => {
      const dto: UpdateCategoryDto = { name: 'גבינות ומעדנים' };
      const updated = { id: 'c1', name: 'גבינות ומעדנים' };
      mockCategoriesService.update.mockResolvedValue(updated);

      const result = await controller.update('c1', dto);

      expect(mockCategoriesService.update).toHaveBeenCalledWith('c1', dto);
      expect(result).toBe(updated);
    });
  });

  describe('remove', () => {
    it('delegates to the service with the id', async () => {
      mockCategoriesService.remove.mockResolvedValue(undefined);

      await controller.remove('c1');

      expect(mockCategoriesService.remove).toHaveBeenCalledWith('c1');
    });
  });
});
