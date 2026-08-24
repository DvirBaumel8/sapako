import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { ProductsService } from './products.service';
import { Product } from './product.entity';
import { ProvidersService } from '../providers/providers.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: mockRepo },
        { provide: ProvidersService, useValue: mockProvidersService },
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

  it('lists only active products for a provider', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'pr1', name: 'Tomatoes', isActive: true },
    ]);

    const products = await service.findActiveByProvider('p1');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { providerId: 'p1', isActive: true },
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
      select: { id: true, providerId: true, name: true, barcode: true },
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
      select: { id: true, providerId: true, name: true, barcode: true },
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
      select: { id: true, providerId: true, name: true, barcode: true },
    });
    expect(products).toEqual([]);
  });
});
