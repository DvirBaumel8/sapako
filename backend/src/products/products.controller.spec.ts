import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BranchProductsController,
  ProviderProductsController,
  ProductAdminController,
} from './products.controller';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UNIT_TYPES } from './unit-types';
import { Role } from '../users/role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { ProviderAccessGuard } from '../permissions/provider-access.guard';

// Unit-level companion to test/authorization.e2e-spec.ts: that file proves
// the guards behave correctly against a real request; this proves each
// route delegates to the service with the right arguments and carries the
// guard/role metadata that behavioural test relies on.
describe('BranchProductsController', () => {
  let controller: BranchProductsController;
  const mockProductsService = {
    findActiveByBranch: jest.fn(),
  };
  const mockPermissionsService = {
    getAccessibleProviderIds: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BranchProductsController(
      mockProductsService as any,
      mockPermissionsService as any,
    );
  });

  describe('guards', () => {
    it('requires authentication and branch access for the whole controller', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        BranchProductsController,
      );
      expect(guards).toEqual([JwtAuthGuard, BranchAccessGuard, RolesGuard]);
    });
  });

  describe('findForBranch', () => {
    it('resolves accessible provider ids and delegates with them', async () => {
      mockPermissionsService.getAccessibleProviderIds.mockResolvedValue(['p1']);
      const products = [{ id: 'prod1' }];
      mockProductsService.findActiveByBranch.mockResolvedValue(products);
      const req = { user: { userId: 'staff1', role: Role.STAFF } };

      const result = await controller.findForBranch(req, 'b1');

      expect(
        mockPermissionsService.getAccessibleProviderIds,
      ).toHaveBeenCalledWith(req.user);
      expect(mockProductsService.findActiveByBranch).toHaveBeenCalledWith(
        'b1',
        ['p1'],
      );
      expect(result).toBe(products);
    });
  });
});

describe('ProviderProductsController', () => {
  let controller: ProviderProductsController;
  const mockProductsService = {
    findActiveByProvider: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProviderProductsController(mockProductsService as any);
  });

  describe('guards', () => {
    it('requires authentication and provider access for the whole controller', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ProviderProductsController,
      );
      expect(guards).toEqual([JwtAuthGuard, ProviderAccessGuard, RolesGuard]);
    });

    it('leaves listing open to any authenticated role with provider access', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderProductsController.prototype.findForProvider,
      );
      expect(roles).toBeUndefined();
    });

    it('restricts creating a product to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderProductsController.prototype.create,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('findForProvider', () => {
    it('delegates to the service with the provider id', async () => {
      const products = [{ id: 'prod1' }];
      mockProductsService.findActiveByProvider.mockResolvedValue(products);

      const result = await controller.findForProvider('p1');

      expect(mockProductsService.findActiveByProvider).toHaveBeenCalledWith(
        'p1',
      );
      expect(result).toBe(products);
    });
  });

  describe('create', () => {
    it('delegates to the service with the provider id and dto', async () => {
      const dto: CreateProductDto = { name: 'עגבניות', unitType: 'ק"ג' };
      const created = { id: 'prod1', ...dto };
      mockProductsService.create.mockResolvedValue(created);

      const result = await controller.create('p1', dto);

      expect(mockProductsService.create).toHaveBeenCalledWith('p1', dto);
      expect(result).toBe(created);
    });
  });
});

describe('ProductAdminController', () => {
  let controller: ProductAdminController;
  const mockProductsService = {
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProductAdminController(mockProductsService as any);
  });

  describe('guards', () => {
    it('requires authentication for the whole controller', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ProductAdminController,
      );
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('restricts updating a product to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProductAdminController.prototype.update,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('restricts removing a product to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProductAdminController.prototype.remove,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('update', () => {
    it('delegates to the service with the id and dto', async () => {
      const dto: UpdateProductDto = { name: 'עגבניות שרי' };
      const updated = { id: 'prod1', name: 'עגבניות שרי' };
      mockProductsService.update.mockResolvedValue(updated);

      const result = await controller.update('prod1', dto);

      expect(mockProductsService.update).toHaveBeenCalledWith('prod1', dto);
      expect(result).toBe(updated);
    });
  });

  describe('remove', () => {
    it('delegates to the service with the id', async () => {
      mockProductsService.remove.mockResolvedValue(undefined);

      await controller.remove('prod1');

      expect(mockProductsService.remove).toHaveBeenCalledWith('prod1');
    });
  });
});

// The unit list is what tells the app a weight from a countable thing, and
// so whether a fractional quantity is allowed. A value outside the list
// would reach quantityStep(), fall through to the "unrecognised" branch and
// silently become a whole-unit product — no error, just a scale item the
// shop can no longer order 1.5 kg of. These tests hold the constraint that
// stops that at the door; test/products-validation.e2e-spec.ts proves the
// pipe enforcing it is actually mounted on the running app.
describe('unitType validation', () => {
  describe('CreateProductDto', () => {
    it.each(UNIT_TYPES)('accepts the listed unit %s', async (unitType) => {
      const dto = plainToInstance(CreateProductDto, {
        name: 'עגבניות',
        unitType,
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects a unit outside the list', async () => {
      const dto = plainToInstance(CreateProductDto, {
        name: 'עגבניות',
        unitType: 'שקית',
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('unitType');
    });

    it('rejects a missing unit, so no product is stored without one', async () => {
      const dto = plainToInstance(CreateProductDto, { name: 'עגבניות' });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('unitType');
    });

    it('rejects an empty-string unit', async () => {
      const dto = plainToInstance(CreateProductDto, {
        name: 'עגבניות',
        unitType: '',
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('unitType');
    });
  });

  describe('UpdateProductDto', () => {
    it.each(UNIT_TYPES)('accepts the listed unit %s', async (unitType) => {
      const dto = plainToInstance(UpdateProductDto, { unitType });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects a unit outside the list', async () => {
      const dto = plainToInstance(UpdateProductDto, { unitType: 'שקית' });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('unitType');
    });

    it('allows the unit to be omitted, since an update may touch only the name', async () => {
      const dto = plainToInstance(UpdateProductDto, { name: 'עגבניות שרי' });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
