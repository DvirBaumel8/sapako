import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { In, IsNull, Not, QueryFailedError } from 'typeorm';
import { ProductsService } from './products.service';
import { Product } from './product.entity';
import { ProvidersService } from '../providers/providers.service';
import { CategoriesService } from '../categories/categories.service';

describe('ProductsService', () => {
  let service: ProductsService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
  };
  const mockProvidersService = {
    findById: jest.fn(),
  };
  const mockCategoriesService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: mockRepo },
        { provide: ProvidersService, useValue: mockProvidersService },
        { provide: CategoriesService, useValue: mockCategoriesService },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it('creates a product under a provider that exists', async () => {
    mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'pr1', ...data }),
    );

    const product = await service.create('p1', {
      name: 'Tomatoes',
      unitType: 'crate',
    });

    expect(mockProvidersService.findById).toHaveBeenCalledWith('p1');
    expect(product).toMatchObject({
      id: 'pr1',
      providerId: 'p1',
      name: 'Tomatoes',
      unitType: 'crate',
    });
  });

  it('rejects with NotFoundException when the provider does not exist, without saving', async () => {
    mockProvidersService.findById.mockRejectedValue(
      new NotFoundException('Provider not found'),
    );

    await expect(
      service.create('missing', { name: 'Tomatoes', unitType: 'crate' }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('creates a product with a categoryId that belongs to the same provider', async () => {
    mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
    mockCategoriesService.findById.mockResolvedValue({
      id: 'c1',
      providerId: 'p1',
    });
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'pr1', ...data }),
    );

    const product = await service.create('p1', {
      name: 'Tomatoes',
      unitType: 'crate',
      categoryId: 'c1',
    });

    expect(product).toMatchObject({ categoryId: 'c1' });
  });

  it('rejects creating a product with a categoryId that belongs to a different provider', async () => {
    mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
    mockCategoriesService.findById.mockResolvedValue({
      id: 'c1',
      providerId: 'OTHER',
    });

    await expect(
      service.create('p1', {
        name: 'Tomatoes',
        unitType: 'crate',
        categoryId: 'c1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('lists only active products for a provider', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'pr1', name: 'Tomatoes', isActive: true },
    ]);

    const products = await service.findActiveByProvider('p1');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { providerId: 'p1', isActive: true },
      order: { name: 'ASC' },
      take: 20000,
    });
    expect(products).toHaveLength(1);
  });

  it('throws NotFoundException when finding a product by an unknown id', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      'Product not found',
    );
  });

  it('updates a product and persists the merged fields', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'pr1',
      providerId: 'p1',
      name: 'Tomatoes',
      unitType: 'crate',
      isActive: true,
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('pr1', {
      name: 'Cherry Tomatoes',
      isActive: false,
    });

    expect(updated).toMatchObject({
      id: 'pr1',
      name: 'Cherry Tomatoes',
      isActive: false,
    });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cherry Tomatoes', isActive: false }),
    );
  });

  it('clears the merge pointer when a hidden product is reactivated', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'pr1',
      providerId: 'p1',
      name: 'Tomatoes',
      isActive: false,
      mergedIntoProductId: 'pr2',
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('pr1', { isActive: true });

    expect(updated.mergedIntoProductId).toBeNull();
  });

  it('reassigns a product to a categoryId that belongs to its own provider', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'pr1',
      providerId: 'p1',
      name: 'Tomatoes',
    });
    mockCategoriesService.findById.mockResolvedValue({
      id: 'c1',
      providerId: 'p1',
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('pr1', { categoryId: 'c1' });

    expect(updated).toMatchObject({ categoryId: 'c1' });
  });

  it('rejects reassigning a product to a categoryId from a different provider', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'pr1',
      providerId: 'p1',
      name: 'Tomatoes',
    });
    mockCategoriesService.findById.mockResolvedValue({
      id: 'c1',
      providerId: 'OTHER',
    });

    await expect(service.update('pr1', { categoryId: 'c1' })).rejects.toThrow(
      BadRequestException,
    );
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('un-assigns a product from its category when categoryId is explicitly null', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'pr1',
      providerId: 'p1',
      name: 'Tomatoes',
      categoryId: 'c1',
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('pr1', { categoryId: null });

    expect(mockCategoriesService.findById).not.toHaveBeenCalled();
    expect(updated.categoryId).toBeNull();
  });

  describe('remove', () => {
    it('deletes a product by id', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove('pr1');

      expect(mockRepo.delete).toHaveBeenCalledWith({ id: 'pr1' });
    });

    it('rejects removing a product that does not exist', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('lists active branch products across accessible providers when ALL', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'pr1', providerId: 'p1', name: 'Tomatoes', barcode: '111' },
    ]);

    const products = await service.findActiveByBranch('b1', 'ALL');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { isActive: true, provider: { branchId: 'b1', isActive: true } },
      select: {
        id: true,
        providerId: true,
        name: true,
        barcode: true,
        additionalBarcodes: true,
      },
      take: 20000,
    });
    expect(products).toHaveLength(1);
  });

  it('filters branch products by the accessible-ids list when not ALL', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'pr1', providerId: 'p1', name: 'Tomatoes', barcode: '111' },
    ]);

    const products = await service.findActiveByBranch('b1', ['p1']);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: {
        isActive: true,
        provider: { branchId: 'b1', isActive: true, id: In(['p1']) },
      },
      select: {
        id: true,
        providerId: true,
        name: true,
        barcode: true,
        additionalBarcodes: true,
      },
      take: 20000,
    });
    expect(products).toHaveLength(1);
  });

  it('queries with an empty In() when the accessible-ids list is empty', async () => {
    mockRepo.find.mockResolvedValue([]);

    const products = await service.findActiveByBranch('b1', []);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: {
        isActive: true,
        provider: { branchId: 'b1', isActive: true, id: In([]) },
      },
      select: {
        id: true,
        providerId: true,
        name: true,
        barcode: true,
        additionalBarcodes: true,
      },
      take: 20000,
    });
    expect(products).toEqual([]);
  });

  describe('findByBarcodeInBranch', () => {
    it('queries only barcoded rows, scoped to the branch and accessible providers', async () => {
      mockRepo.find.mockResolvedValue([]);

      await service.findByBarcodeInBranch('b1', ['p1'], '016000185517');

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: [
          {
            isActive: true,
            provider: { branchId: 'b1', isActive: true, id: In(['p1']) },
            barcode: Not(IsNull()),
          },
          {
            isActive: true,
            provider: { branchId: 'b1', isActive: true, id: In(['p1']) },
            additionalBarcodes: expect.anything(),
          },
        ],
        select: {
          id: true,
          providerId: true,
          name: true,
          barcode: true,
          additionalBarcodes: true,
        },
        take: 20000,
      });
    });

    it('matches a UPC-A candidate that lost its leading zero, via the normalised key', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'pr1', providerId: 'p1', name: 'Milk', barcode: '016000185517' },
        {
          id: 'pr2',
          providerId: 'p1',
          name: 'Other',
          barcode: '7290000060071',
        },
      ]);

      // Scanned as the 11-digit, zero-stripped form of the same UPC-A.
      const matches = await service.findByBarcodeInBranch(
        'b1',
        'ALL',
        '16000185517',
      );

      expect(matches).toEqual([
        { id: 'pr1', providerId: 'p1', name: 'Milk', barcode: '016000185517' },
      ]);
    });

    it('falls back to exact equality for a non-GTIN supplier code', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'pr1', providerId: 'p1', name: 'Widget', barcode: 'SUP-42' },
      ]);

      const matches = await service.findByBarcodeInBranch(
        'b1',
        'ALL',
        'SUP-42',
      );

      expect(matches).toHaveLength(1);

      const noMatch = await service.findByBarcodeInBranch(
        'b1',
        'ALL',
        'SUP-43',
      );
      expect(noMatch).toEqual([]);
    });
  });

  describe('updateNote', () => {
    it('saves the trimmed note on a product that belongs to the provider', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: 'pr1',
        providerId: 'p1',
        note: null,
      });
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.updateNote(
        'p1',
        'pr1',
        '  לבקש תאריך ארוך  ',
      );

      expect(mockRepo.findOneBy).toHaveBeenCalledWith({
        id: 'pr1',
        providerId: 'p1',
      });
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pr1', note: 'לבקש תאריך ארוך' }),
      );
      expect(result.note).toBe('לבקש תאריך ארוך');
    });

    it('stores a whitespace-only note as null', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: 'pr1',
        providerId: 'p1',
        note: 'ישן',
      });
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.updateNote('p1', 'pr1', '   ');

      expect(result.note).toBeNull();
    });

    it('clears the note when given null', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: 'pr1',
        providerId: 'p1',
        note: 'ישן',
      });
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.updateNote('p1', 'pr1', null);

      expect(result.note).toBeNull();
    });

    it('rejects with NotFoundException when the product is not under that provider, without saving', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(service.updateNote('p1', 'pr-of-p2', 'x')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('barcode lookup with additional barcodes', () => {
    it('finds a product by one of its additional barcodes', async () => {
      mockRepo.find.mockResolvedValue([
        {
          id: 'a',
          providerId: 'p1',
          name: 'סלרי ראש',
          barcode: '7290000000534',
          additionalBarcodes: ['7290003706020', '27'],
        },
        {
          id: 'b',
          providerId: 'p1',
          name: 'גזר',
          barcode: '7290000000794',
          additionalBarcodes: [],
        },
      ]);

      const result = await service.findByBarcodeInBranch(
        'br1',
        'ALL',
        '7290003706020',
      );

      expect(result.map((p) => p.id)).toEqual(['a']);
    });

    it('matches a non-GTIN additional code exactly', async () => {
      mockRepo.find.mockResolvedValue([
        {
          id: 'a',
          providerId: 'p1',
          name: 'סלרי ראש',
          barcode: '7290000000534',
          additionalBarcodes: ['27'],
        },
      ]);

      expect(
        (await service.findByBarcodeInBranch('br1', 'ALL', '27')).map(
          (p) => p.id,
        ),
      ).toEqual(['a']);
      expect(await service.findByBarcodeInBranch('br1', 'ALL', '2')).toEqual(
        [],
      );
    });
  });

  describe('duplicate names', () => {
    const uniqueViolation = Object.assign(
      new QueryFailedError('INSERT', [], new Error('dup')),
      { code: '23505' },
    );

    it('turns a duplicate name on create into a ConflictException', async () => {
      mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockRejectedValue(uniqueViolation);

      await expect(
        service.create('p1', { name: 'סלרי ראש', unitType: 'קרטון' }),
      ).rejects.toThrow(ConflictException);
    });

    it('turns a duplicate name on update into a ConflictException', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: 'pr1',
        providerId: 'p1',
        name: 'גזר',
      });
      mockRepo.save.mockRejectedValue(uniqueViolation);

      await expect(service.update('pr1', { name: 'סלרי ראש' })).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
