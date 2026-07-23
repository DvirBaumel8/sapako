import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProvidersService } from './providers.service';
import { Provider } from './provider.entity';

describe('ProvidersService', () => {
  let service: ProvidersService;
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
        ProvidersService,
        { provide: getRepositoryToken(Provider), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(ProvidersService);
  });

  it('creates a provider under a branch', async () => {
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'p1', ...data }),
    );

    const provider = await service.create('b1', {
      name: 'Meat Co',
      phone: '+972501234567',
    });

    expect(provider).toMatchObject({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      phone: '+972501234567',
    });
  });

  it('lists only active providers for a branch', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'p1', name: 'Meat Co', isActive: true },
    ]);

    const providers = await service.findActiveByBranch('b1');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { branchId: 'b1', isActive: true },
    });
    expect(providers).toHaveLength(1);
  });

  it('throws NotFoundException when finding a provider by an unknown id', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      'Provider not found',
    );
  });

  it('updates a provider and persists the merged fields', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      phone: '+972501234567',
      isActive: true,
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('p1', {
      name: 'Meat Co Ltd',
      isActive: false,
    });

    expect(updated).toMatchObject({
      id: 'p1',
      name: 'Meat Co Ltd',
      isActive: false,
    });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Meat Co Ltd', isActive: false }),
    );
  });
});
