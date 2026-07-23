import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from './order-status.enum';
import { ProvidersService } from '../providers/providers.service';
import { ProductsService } from '../products/products.service';

describe('OrdersService', () => {
  let service: OrdersService;
  const orderRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };
  const orderItemRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  const providersService = { findById: jest.fn() };
  const productsService = { findById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: ProvidersService, useValue: providersService },
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  describe('createDraft', () => {
    it('creates a DRAFT order when the provider belongs to the given branch', async () => {
      providersService.findById.mockResolvedValue({ id: 'p1', branchId: 'b1' });
      orderRepo.create.mockImplementation((data) => data);
      orderRepo.save.mockImplementation((data) =>
        Promise.resolve({ id: 'o1', items: [], ...data }),
      );

      const order = await service.createDraft('u1', {
        branchId: 'b1',
        providerId: 'p1',
      });

      expect(order).toMatchObject({
        id: 'o1',
        status: OrderStatus.DRAFT,
        branchId: 'b1',
        providerId: 'p1',
      });
    });

    it("rejects when the provider doesn't belong to the given branch", async () => {
      providersService.findById.mockResolvedValue({
        id: 'p1',
        branchId: 'OTHER_BRANCH',
      });

      await expect(
        service.createDraft('u1', { branchId: 'b1', providerId: 'p1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addItem', () => {
    it('rejects adding an item to a PUBLISHED order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
        providerId: 'p1',
      });

      await expect(
        service.addItem('o1', {
          productId: undefined,
          productNameSnapshot: 'Ad-hoc item',
          unitType: 'kg',
          quantity: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('snapshots the product name/unit when adding a catalog product', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
        providerId: 'p1',
      });
      productsService.findById.mockResolvedValue({
        id: 'pr1',
        providerId: 'p1',
        name: 'Tomatoes',
        unitType: 'crate',
      });
      orderItemRepo.create.mockImplementation((data) => data);
      orderItemRepo.save.mockImplementation((data) =>
        Promise.resolve({ id: 'oi1', ...data }),
      );

      const item = await service.addItem('o1', {
        productId: 'pr1',
        quantity: 3,
      });

      expect(item).toMatchObject({
        orderId: 'o1',
        productId: 'pr1',
        productNameSnapshot: 'Tomatoes',
        unitType: 'crate',
        quantity: 3,
      });
    });

    it('rejects a catalog product that belongs to a different provider than the order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
        providerId: 'p1',
      });
      productsService.findById.mockResolvedValue({
        id: 'pr1',
        providerId: 'OTHER_PROVIDER',
        name: 'Tomatoes',
      });

      await expect(
        service.addItem('o1', { productId: 'pr1', quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an ad-hoc item missing productNameSnapshot or unitType', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
        providerId: 'p1',
      });

      await expect(service.addItem('o1', { quantity: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects adding an item when the order does not exist', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addItem('missing', {
          productNameSnapshot: 'Ad-hoc item',
          unitType: 'kg',
          quantity: 2,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateItemQuantity', () => {
    it('updates the quantity of an item on a DRAFT order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      orderItemRepo.findOne.mockResolvedValue({
        id: 'oi1',
        orderId: 'o1',
        quantity: 1,
      });
      orderItemRepo.save.mockImplementation((data) => Promise.resolve(data));

      const item = await service.updateItemQuantity('o1', 'oi1', 5);

      expect(item).toMatchObject({ id: 'oi1', quantity: 5 });
    });

    it('rejects updating an item on a PUBLISHED order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
      });

      await expect(service.updateItemQuantity('o1', 'oi1', 5)).rejects.toThrow(
        ConflictException,
      );
      expect(orderItemRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects updating an item that does not exist on the order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      orderItemRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateItemQuantity('o1', 'missing', 5),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('removes an item from a DRAFT order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      orderItemRepo.delete.mockResolvedValue({ affected: 1 });

      await service.removeItem('o1', 'oi1');

      expect(orderItemRepo.delete).toHaveBeenCalledWith({
        id: 'oi1',
        orderId: 'o1',
      });
    });

    it('rejects removing an item from a PUBLISHED order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
      });

      await expect(service.removeItem('o1', 'oi1')).rejects.toThrow(
        ConflictException,
      );
      expect(orderItemRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('transitions a DRAFT order to PUBLISHED and sets publishedAt via an atomic update', async () => {
      const draftOrder = { id: 'o1', status: OrderStatus.DRAFT };
      const publishedOrder = {
        id: 'o1',
        status: OrderStatus.PUBLISHED,
        items: [],
        publishedAt: new Date(),
      };
      // First findOne: existence/status check. Second findOne (via findById):
      // re-read after the atomic update to return the fresh state.
      orderRepo.findOne
        .mockResolvedValueOnce(draftOrder)
        .mockResolvedValueOnce(publishedOrder);
      orderRepo.update.mockResolvedValue({ affected: 1 });

      const published = await service.publish('o1');

      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 'o1', status: OrderStatus.DRAFT },
        expect.objectContaining({ status: OrderStatus.PUBLISHED }),
      );
      expect(published.status).toBe(OrderStatus.PUBLISHED);
      expect(published.publishedAt).toBeInstanceOf(Date);
    });

    it('rejects publishing an order that is already PUBLISHED', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
      });

      await expect(service.publish('o1')).rejects.toThrow(ConflictException);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('rejects publishing an order that does not exist', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.publish('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('rejects with ConflictException when losing a race to a concurrent publish() call', async () => {
      // The initial read sees DRAFT (so it passes the first check), but by
      // the time the conditional UPDATE runs, a concurrent publish() has
      // already flipped the row to PUBLISHED — so this UPDATE matches zero
      // rows even though status was DRAFT a moment ago.
      orderRepo.findOne.mockResolvedValueOnce({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      orderRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.publish('o1')).rejects.toThrow(ConflictException);
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 'o1', status: OrderStatus.DRAFT },
        expect.objectContaining({ status: OrderStatus.PUBLISHED }),
      );
    });
  });
});
