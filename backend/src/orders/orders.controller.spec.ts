import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrdersController, BranchOrdersController } from './orders.controller';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { Role } from '../users/role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { ProviderAccessGuard } from '../permissions/provider-access.guard';
import { OrderAccessGuard } from './order-access.guard';

// Unit-level companion to test/authorization.e2e-spec.ts: that file proves
// the guards behave correctly against a real request; this proves each
// route delegates to the service with the right arguments and carries the
// per-method guard OrdersController relies on instead of a class-level
// RolesGuard (any authenticated user with provider/order access may act,
// regardless of role).
describe('OrdersController', () => {
  let controller: OrdersController;
  const mockOrdersService = {
    createDraft: jest.fn(),
    addItem: jest.fn(),
    updateItemQuantity: jest.fn(),
    removeItem: jest.fn(),
    publish: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OrdersController(mockOrdersService as any);
  });

  describe('guards', () => {
    it('requires authentication for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, OrdersController);
      expect(guards).toEqual([JwtAuthGuard]);
    });

    it('requires provider access to create a draft', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        OrdersController.prototype.create,
      );
      expect(guards).toEqual([ProviderAccessGuard]);
    });

    it.each([
      'addItem',
      'updateItem',
      'removeItem',
      'publish',
      'remove',
    ] as const)('requires order access for %s', (method) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        OrdersController.prototype[method],
      );
      expect(guards).toEqual([OrderAccessGuard]);
    });
  });

  describe('create', () => {
    it('delegates to the service with the caller id and dto', async () => {
      const dto: CreateOrderDto = { branchId: 'b1', providerId: 'p1' };
      const created = { id: 'o1', ...dto };
      mockOrdersService.createDraft.mockResolvedValue(created);
      const req = { user: { userId: 'u1', role: Role.STAFF } };

      const result = await controller.create(req, dto);

      expect(mockOrdersService.createDraft).toHaveBeenCalledWith('u1', dto);
      expect(result).toBe(created);
    });
  });

  describe('addItem', () => {
    it('delegates to the service with the order id and dto', async () => {
      const dto: AddOrderItemDto = { productId: 'prod1', quantity: 2 };
      const created = { id: 'i1', ...dto };
      mockOrdersService.addItem.mockResolvedValue(created);

      const result = await controller.addItem('o1', dto);

      expect(mockOrdersService.addItem).toHaveBeenCalledWith('o1', dto);
      expect(result).toBe(created);
    });
  });

  describe('updateItem', () => {
    it('delegates to the service with the order id, item id and quantity', async () => {
      const dto: UpdateOrderItemDto = { quantity: 3 };
      const updated = { id: 'i1', quantity: 3 };
      mockOrdersService.updateItemQuantity.mockResolvedValue(updated);

      const result = await controller.updateItem('o1', 'i1', dto);

      expect(mockOrdersService.updateItemQuantity).toHaveBeenCalledWith(
        'o1',
        'i1',
        3,
      );
      expect(result).toBe(updated);
    });
  });

  describe('removeItem', () => {
    it('delegates to the service with the order id and item id', async () => {
      mockOrdersService.removeItem.mockResolvedValue(undefined);

      await controller.removeItem('o1', 'i1');

      expect(mockOrdersService.removeItem).toHaveBeenCalledWith('o1', 'i1');
    });
  });

  describe('publish', () => {
    it('delegates to the service with the order id', async () => {
      const published = { id: 'o1', status: 'PUBLISHED' };
      mockOrdersService.publish.mockResolvedValue(published);

      const result = await controller.publish('o1');

      expect(mockOrdersService.publish).toHaveBeenCalledWith('o1');
      expect(result).toBe(published);
    });
  });

  describe('remove', () => {
    it('delegates to the service with the order id', async () => {
      mockOrdersService.remove.mockResolvedValue(undefined);

      await controller.remove('o1');

      expect(mockOrdersService.remove).toHaveBeenCalledWith('o1');
    });
  });
});

describe('BranchOrdersController', () => {
  let controller: BranchOrdersController;
  const mockOrdersService = {
    findByBranch: jest.fn(),
  };
  const mockPermissionsService = {
    getAccessibleProviderIds: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BranchOrdersController(
      mockOrdersService as any,
      mockPermissionsService as any,
    );
  });

  describe('guards', () => {
    it('requires authentication and branch access for the whole controller', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        BranchOrdersController,
      );
      expect(guards).toEqual([JwtAuthGuard, BranchAccessGuard]);
    });
  });

  describe('findForBranch', () => {
    it('resolves accessible provider ids and delegates with them', async () => {
      mockPermissionsService.getAccessibleProviderIds.mockResolvedValue(['p1']);
      const orders = [{ id: 'o1' }];
      mockOrdersService.findByBranch.mockResolvedValue(orders);
      const req = { user: { userId: 'staff1', role: Role.STAFF } };

      const result = await controller.findForBranch(req, 'b1');

      expect(
        mockPermissionsService.getAccessibleProviderIds,
      ).toHaveBeenCalledWith(req.user);
      expect(mockOrdersService.findByBranch).toHaveBeenCalledWith('b1', ['p1']);
      expect(result).toBe(orders);
    });
  });
});
