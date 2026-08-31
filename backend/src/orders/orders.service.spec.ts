import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { In } from 'typeorm';
import { OrdersService, RECENT_ORDER_LIMIT } from './orders.service';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from './order-status.enum';
import { ProvidersService } from '../providers/providers.service';
import { ProductsService } from '../products/products.service';
import { OrderNotifierService } from '../notifications/order-notifier.service';

describe('OrdersService', () => {
  let service: OrdersService;

  // Fake repository handed out by `manager.getRepository(OrderItem)` inside
  // a transaction — stands in for the item writes that addItem/
  // updateItem/removeItem perform once they hold the order lock.
  const managerOrderItemRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  // Fake transactional EntityManager. `manager.findOne` is how
  // withDraftOrder reads+locks the order row (with `lock: { mode:
  // 'pessimistic_write' }`); `manager.delete` backs removeItem.
  const manager = {
    findOne: jest.fn(),
    getRepository: jest.fn(() => managerOrderItemRepo),
    delete: jest.fn(),
  };
  const orderRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    // Real TypeORM's `manager.transaction(work)` opens a transaction and
    // invokes `work(transactionalEntityManager)`. Our fake just invokes the
    // callback directly with the fake `manager` above, so service code that
    // does `this.orderRepo.manager.transaction(async (manager) => ...)`
    // runs against our mocks without a real database.
    manager: {
      transaction: jest.fn((work: (m: typeof manager) => unknown) =>
        work(manager),
      ),
    },
  };
  const providersService = { findById: jest.fn() };
  const productsService = { findById: jest.fn() };
  // Returns false by default: "not configured", the state CI runs in.
  const orderNotifier = { sendOrderPublished: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    // jest.clearAllMocks() clears call history but preserves
    // mockImplementation, so this is a defensive re-affirmation in case a
    // test overrides it with mockImplementationOnce.
    orderRepo.manager.transaction.mockImplementation((work: any) =>
      work(manager),
    );
    manager.getRepository.mockReturnValue(managerOrderItemRepo);

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: ProvidersService, useValue: providersService },
        { provide: ProductsService, useValue: productsService },
        { provide: OrderNotifierService, useValue: orderNotifier },
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

  describe('findByBranch', () => {
    it('lists all orders for a branch when the caller has ALL access', async () => {
      // items is always present: the query eager-loads the relation.
      orderRepo.find.mockResolvedValue([
        { id: 'o1', branchId: 'b1', items: [{ id: 'i1' }] },
      ]);

      const orders = await service.findByBranch('b1', 'ALL');

      expect(orderRepo.find).toHaveBeenCalledWith({
        where: { branchId: 'b1' },
        relations: { items: true, provider: true },
        order: { createdAt: 'DESC' },
        take: RECENT_ORDER_LIMIT,
      });
      expect(orders).toHaveLength(1);
    });

    it('filters orders by the accessible provider ids when not ALL', async () => {
      orderRepo.find.mockResolvedValue([
        { id: 'o1', branchId: 'b1', providerId: 'p1', items: [{ id: 'i1' }] },
      ]);

      const orders = await service.findByBranch('b1', ['p1']);

      expect(orderRepo.find).toHaveBeenCalledWith({
        where: { branchId: 'b1', providerId: In(['p1']) },
        relations: { items: true, provider: true },
        order: { createdAt: 'DESC' },
        take: RECENT_ORDER_LIMIT,
      });
      expect(orders).toHaveLength(1);
    });

    it('drops orders with no items, which every caller discards anyway', async () => {
      // Both screens that read this list filter empty orders out client-side,
      // so returning them is pure transfer cost over a slow connection.
      orderRepo.find.mockResolvedValue([
        { id: 'o1', branchId: 'b1', items: [{ id: 'i1' }] },
        { id: 'o2', branchId: 'b1', items: [] },
      ]);

      const orders = await service.findByBranch('b1', 'ALL');

      expect(orders.map((o) => o.id)).toEqual(['o1']);
    });
  });

  describe('addItem', () => {
    it('rejects adding an item to a PUBLISHED order', async () => {
      manager.findOne.mockResolvedValue({
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

    it('snapshots the product name/unit when adding a catalog product, reading the order via a pessimistic lock', async () => {
      manager.findOne.mockResolvedValue({
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
      managerOrderItemRepo.create.mockImplementation((data) => data);
      managerOrderItemRepo.save.mockImplementation((data) =>
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
      // We can't spin up two real concurrent requests against a mocked
      // repository, so this is the unit-testable proxy for "this mutation
      // is race-safe": it asserts the order row is read inside
      // manager.transaction() with a pessimistic_write lock, which is what
      // makes Postgres serialize this against a concurrent publish() at the
      // database level (see withDraftOrder's doc comment in
      // orders.service.ts).
      expect(orderRepo.manager.transaction).toHaveBeenCalled();
      expect(manager.findOne).toHaveBeenCalledWith(Order, {
        where: { id: 'o1' },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('rejects a catalog product that belongs to a different provider than the order', async () => {
      manager.findOne.mockResolvedValue({
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
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
        providerId: 'p1',
      });

      await expect(service.addItem('o1', { quantity: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects adding an item when the order does not exist', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.addItem('missing', {
          productNameSnapshot: 'Ad-hoc item',
          unitType: 'kg',
          quantity: 2,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateItem', () => {
    it('updates the quantity of an item on a DRAFT order', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      managerOrderItemRepo.findOne.mockResolvedValue({
        id: 'oi1',
        orderId: 'o1',
        quantity: 1,
      });
      managerOrderItemRepo.save.mockImplementation((data) =>
        Promise.resolve(data),
      );

      const item = await service.updateItem('o1', 'oi1', { quantity: 5 });

      expect(item).toMatchObject({ id: 'oi1', quantity: 5 });
    });

    it('rejects updating an item on a PUBLISHED order', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
      });

      await expect(
        service.updateItem('o1', 'oi1', { quantity: 5 }),
      ).rejects.toThrow(ConflictException);
      expect(managerOrderItemRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects updating an item that does not exist on the order', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      managerOrderItemRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateItem('o1', 'missing', { quantity: 5 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('removes an item from a DRAFT order', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      manager.delete.mockResolvedValue({ affected: 1 });

      await service.removeItem('o1', 'oi1');

      expect(manager.delete).toHaveBeenCalledWith(OrderItem, {
        id: 'oi1',
        orderId: 'o1',
      });
    });

    it('rejects removing an item that does not exist on the order', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      manager.delete.mockResolvedValue({ affected: 0 });

      await expect(service.removeItem('o1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects removing an item from a PUBLISHED order', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
      });

      await expect(service.removeItem('o1', 'oi1')).rejects.toThrow(
        ConflictException,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an order regardless of status', async () => {
      orderRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove('o1');

      expect(orderRepo.delete).toHaveBeenCalledWith({ id: 'o1' });
    });

    it('rejects removing an order that does not exist', async () => {
      orderRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
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

  describe('changing an item unit', () => {
    const draftWithItem = (item: Record<string, unknown>) => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      managerOrderItemRepo.findOne.mockResolvedValue({
        id: 'oi1',
        orderId: 'o1',
        ...item,
      });
      managerOrderItemRepo.save.mockImplementation((data) =>
        Promise.resolve(data),
      );
    };

    it('changes the unit without touching the quantity', async () => {
      draftWithItem({ unitType: 'קרטון', quantity: 3 });

      const item = await service.updateItem('o1', 'oi1', { unitType: 'ק"ג' });

      expect(item).toMatchObject({ unitType: 'ק"ג', quantity: 3 });
    });

    it('changes the unit and the quantity together', async () => {
      draftWithItem({ unitType: 'קרטון', quantity: 3 });

      const item = await service.updateItem('o1', 'oi1', {
        unitType: 'ק"ג',
        quantity: 2.5,
      });

      expect(item).toMatchObject({ unitType: 'ק"ג', quantity: 2.5 });
    });

    it('keeps a fraction when the new unit is a weight', async () => {
      draftWithItem({ unitType: 'קרטון', quantity: 1 });

      const item = await service.updateItem('o1', 'oi1', {
        unitType: 'ק"ג',
        quantity: 1.5,
      });

      expect(item).toMatchObject({ quantity: 1.5 });
    });

    it('rounds a fraction away when switching to a counted unit', async () => {
      // 2.5 kg cannot become 2.5 cartons. Rounds rather than truncates, so
      // the order is not quietly shrunk.
      draftWithItem({ unitType: 'ק"ג', quantity: 2.5 });

      const item = await service.updateItem('o1', 'oi1', { unitType: 'קרטון' });

      expect(item).toMatchObject({ unitType: 'קרטון', quantity: 3 });
    });

    it('never rounds a counted quantity down to zero', async () => {
      // 0.4 kg would round to 0, and a zero-quantity line is one the add and
      // update endpoints both reject — the order would hold a row it could
      // not otherwise create.
      draftWithItem({ unitType: 'ק"ג', quantity: 0.4 });

      const item = await service.updateItem('o1', 'oi1', { unitType: 'יחידה' });

      expect(item).toMatchObject({ quantity: 1 });
    });

    it('leaves a whole quantity alone when switching to a counted unit', async () => {
      draftWithItem({ unitType: 'ק"ג', quantity: 4 });

      const item = await service.updateItem('o1', 'oi1', { unitType: 'קרטון' });

      expect(item).toMatchObject({ quantity: 4 });
    });

    it('rejects a request that changes nothing', async () => {
      await expect(service.updateItem('o1', 'oi1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a unit change once the order has been handed to WhatsApp', async () => {
      // AWAITING_CONFIRMATION means a message carrying these lines may
      // already be with the supplier; the record must not drift from it.
      manager.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.AWAITING_CONFIRMATION,
      });

      await expect(
        service.updateItem('o1', 'oi1', { unitType: 'ק"ג' }),
      ).rejects.toThrow(ConflictException);
      expect(managerOrderItemRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('handOff', () => {
    it('moves a draft to AWAITING_CONFIRMATION and stamps the handoff time', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      orderRepo.update.mockResolvedValue({ affected: 1 });

      await service.handOff('o1');

      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 'o1', status: OrderStatus.DRAFT },
        expect.objectContaining({ status: OrderStatus.AWAITING_CONFIRMATION }),
      );
      const [, changes] = orderRepo.update.mock.calls[0];
      expect(changes.handedOffAt).toBeInstanceOf(Date);
    });

    it('does not set publishedAt, since nothing has been sent yet', async () => {
      // The whole point of the state: publishedAt must mean "the supplier was
      // contacted", not "WhatsApp was opened".
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      orderRepo.update.mockResolvedValue({ affected: 1 });

      await service.handOff('o1');

      const [, changes] = orderRepo.update.mock.calls[0];
      expect(changes.publishedAt).toBeUndefined();
    });

    it('rejects a second handoff of the same order', async () => {
      // A double-tap must not re-stamp the handoff time.
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.AWAITING_CONFIRMATION,
      });
      orderRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.handOff('o1')).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for an order that does not exist', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.handOff('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmSent', () => {
    const awaiting = () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.AWAITING_CONFIRMATION,
      });
      orderRepo.update.mockResolvedValue({ affected: 1 });
      orderRepo.find.mockResolvedValue([]);
    };

    it('publishes the order and stamps publishedAt', async () => {
      awaiting();

      await service.confirmSent('o1');

      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 'o1', status: OrderStatus.AWAITING_CONFIRMATION },
        expect.objectContaining({ status: OrderStatus.PUBLISHED }),
      );
      const [, changes] = orderRepo.update.mock.calls[0];
      expect(changes.publishedAt).toBeInstanceOf(Date);
    });

    it('emails the confirmed order', async () => {
      awaiting();
      orderNotifier.sendOrderPublished.mockResolvedValue(true);

      await service.confirmSent('o1');

      expect(orderNotifier.sendOrderPublished).toHaveBeenCalled();
    });

    it('records that the email went out', async () => {
      awaiting();
      orderNotifier.sendOrderPublished.mockResolvedValue(true);

      await service.confirmSent('o1');

      const notified = orderRepo.update.mock.calls.find(
        ([, changes]) => changes.notificationSentAt instanceof Date,
      );
      expect(notified).toBeDefined();
    });

    it('leaves notificationSentAt unset when email is not configured', async () => {
      // The normal state locally and in CI. Not an error, and not something
      // to record as a sent email.
      awaiting();
      orderNotifier.sendOrderPublished.mockResolvedValue(false);

      await service.confirmSent('o1');

      const notified = orderRepo.update.mock.calls.find(
        ([, changes]) => changes.notificationSentAt instanceof Date,
      );
      expect(notified).toBeUndefined();
    });

    it('still confirms the order when the email fails', async () => {
      // The message is already with the supplier by now. Failing here would
      // show an error for something that worked and invite a second send.
      awaiting();
      orderNotifier.sendOrderPublished.mockRejectedValue(
        new Error('Resend is down'),
      );

      await expect(service.confirmSent('o1')).resolves.toBeDefined();
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 'o1', status: OrderStatus.AWAITING_CONFIRMATION },
        expect.objectContaining({ status: OrderStatus.PUBLISHED }),
      );
    });

    it('rejects confirming an order that was never handed off', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.DRAFT,
      });
      orderRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.confirmSent('o1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects confirming the same order twice, so no duplicate email goes out', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
      });
      orderRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.confirmSent('o1')).rejects.toThrow(
        ConflictException,
      );
      expect(orderNotifier.sendOrderPublished).not.toHaveBeenCalled();
    });
  });

  describe('revertToDraft', () => {
    it('returns an awaiting order to DRAFT and clears the handoff time', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.AWAITING_CONFIRMATION,
      });
      orderRepo.update.mockResolvedValue({ affected: 1 });

      await service.revertToDraft('o1');

      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 'o1', status: OrderStatus.AWAITING_CONFIRMATION },
        { status: OrderStatus.DRAFT, handedOffAt: null },
      );
    });

    it('sends no email, because nothing was sent', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.AWAITING_CONFIRMATION,
      });
      orderRepo.update.mockResolvedValue({ affected: 1 });

      await service.revertToDraft('o1');

      expect(orderNotifier.sendOrderPublished).not.toHaveBeenCalled();
    });

    it('rejects reverting an order that is already published', async () => {
      // Once confirmed, the supplier has it. Reverting would let the items
      // be edited underneath an order that was really placed.
      orderRepo.findOne.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PUBLISHED,
      });
      orderRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.revertToDraft('o1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
