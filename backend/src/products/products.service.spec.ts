import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product } from './product.entity';

describe('ProductsService', () => {
  let service: ProductsService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it('creates a product under a provider', async () => {
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'pr1', ...data }),
    );

    const product = await service.create('p1', {
      name: 'Tomatoes',
      unitType: 'crate',
    });

    expect(product).toMatchObject({
      id: 'pr1',
      providerId: 'p1',
      name: 'Tomatoes',
      unitType: 'crate',
    });
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
});
