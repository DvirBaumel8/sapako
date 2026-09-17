import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CategoriesService } from './categories.service';
import { Category } from './category.entity';
import { ProvidersService } from '../providers/providers.service';

// Same shape Postgres actually throws for a unique-constraint violation —
// used to prove `create` catches this specific error and nothing else.
function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], { code: '23505' } as any);
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  const mockManager = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockRepo = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    manager: {
      transaction: jest.fn((work: (manager: typeof mockManager) => unknown) =>
        work(mockManager),
      ),
    },
  };
  const mockProvidersService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.manager.transaction.mockImplementation((work) => work(mockManager));
    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: mockRepo },
        { provide: ProvidersService, useValue: mockProvidersService },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  describe('create', () => {
    it('creates a category under a provider that exists', async () => {
      mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
      mockManager.create.mockImplementation((_entity, data) => data);
      mockManager.save.mockImplementation((data) =>
        Promise.resolve({ id: 'c1', ...data }),
      );

      const category = await service.create('p1', { name: 'גבינות' });

      expect(mockProvidersService.findById).toHaveBeenCalledWith('p1');
      expect(mockManager.create).toHaveBeenCalledWith(Category, {
        providerId: 'p1',
        name: 'גבינות',
      });
      expect(category).toMatchObject({ id: 'c1', providerId: 'p1', name: 'גבינות' });
    });

    it('rejects with NotFoundException when the provider does not exist, without opening a transaction', async () => {
      mockProvidersService.findById.mockRejectedValue(
        new NotFoundException('Provider not found'),
      );

      await expect(service.create('missing', { name: 'גבינות' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects with ConflictException when a category with the same name already exists for the provider — including when both requests race past a pre-check', async () => {
      mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
      mockManager.create.mockImplementation((_entity, data) => data);
      mockManager.save.mockRejectedValue(uniqueViolation());

      await expect(service.create('p1', { name: 'גבינות' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('lets an unrelated database error through rather than reporting it as a name conflict', async () => {
      mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
      mockManager.create.mockImplementation((_entity, data) => data);
      mockManager.save.mockRejectedValue(new Error('connection reset'));

      await expect(service.create('p1', { name: 'גבינות' })).rejects.toThrow(
        'connection reset',
      );
    });

    it('allows the same category name for two different providers', async () => {
      // Categories are per-provider, unlike departments (branch-wide) — the
      // same name colliding across two unrelated suppliers must not block
      // either of them.
      mockProvidersService.findById.mockResolvedValue({ id: 'p2' });
      mockManager.create.mockImplementation((_entity, data) => data);
      mockManager.save.mockImplementation((data) =>
        Promise.resolve({ id: 'c2', ...data }),
      );

      const category = await service.create('p2', { name: 'ירקות' });

      expect(category).toMatchObject({ providerId: 'p2', name: 'ירקות' });
    });
  });

  describe('findAllForProvider', () => {
    it('lists categories scoped to one provider', async () => {
      mockRepo.find.mockResolvedValue([{ id: 'c1', name: 'גבינות' }]);

      const categories = await service.findAllForProvider('p1');

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { providerId: 'p1' },
        order: { createdAt: 'ASC' },
      });
      expect(categories).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('throws NotFoundException for an unknown id', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow('Category not found');
    });
  });

  describe('update', () => {
    it('renames a category and persists it', async () => {
      mockRepo.findOneBy.mockImplementation((where) =>
        Promise.resolve(
          'id' in where ? { id: 'c1', providerId: 'p1', name: 'גבינות' } : null,
        ),
      );
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      const updated = await service.update('c1', { name: 'גבינות ומעדנים' });

      expect(updated).toMatchObject({ id: 'c1', name: 'גבינות ומעדנים' });
    });

    it('allows updating without changing the name (no self-conflict)', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: 'c1', providerId: 'p1', name: 'גבינות' });
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      await service.update('c1', { name: 'גבינות' });

      expect(mockRepo.findOneBy).toHaveBeenCalledTimes(1); // only the findById lookup
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('rejects renaming to a name already used by another category of the same provider', async () => {
      mockRepo.findOneBy.mockImplementation((where) =>
        Promise.resolve(
          'id' in where
            ? { id: 'c1', providerId: 'p1', name: 'גבינות' }
            : { id: 'c2', providerId: 'p1', name: 'קפה' },
        ),
      );

      await expect(service.update('c1', { name: 'קפה' })).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a category by id', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove('c1');

      expect(mockRepo.delete).toHaveBeenCalledWith({ id: 'c1' });
    });

    it('rejects removing a category that does not exist', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
