import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { ProvidersService } from './providers.service';
import { Provider } from './provider.entity';
import { BranchesService } from '../branches/branches.service';

describe('ProvidersService', () => {
  let service: ProvidersService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
  const mockBranchesService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: getRepositoryToken(Provider), useValue: mockRepo },
        { provide: BranchesService, useValue: mockBranchesService },
      ],
    }).compile();
    service = module.get(ProvidersService);
  });

  it('creates a provider under a branch that exists', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'p1', ...data }),
    );

    const provider = await service.create('b1', {
      name: 'Meat Co',
      phone: '+972501234567',
    });

    expect(mockBranchesService.findById).toHaveBeenCalledWith('b1');
    expect(provider).toMatchObject({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      phone: '+972501234567',
    });
  });

  it('rejects with NotFoundException when the branch does not exist, without saving', async () => {
    mockBranchesService.findById.mockRejectedValue(
      new NotFoundException('Branch not found'),
    );

    await expect(
      service.create('missing', { name: 'Meat Co', phone: '+972501234567' }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('lists all active providers for a branch when the caller has ALL access', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'p1', name: 'Meat Co', isActive: true },
    ]);

    const providers = await service.findActiveByBranch('b1', 'ALL');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { branchId: 'b1', isActive: true },
    });
    expect(providers).toHaveLength(1);
  });

  it('filters providers by the accessible-ids list when not ALL', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'p1', name: 'Meat Co', isActive: true },
    ]);

    const providers = await service.findActiveByBranch('b1', ['p1']);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { branchId: 'b1', isActive: true, id: In(['p1']) },
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
