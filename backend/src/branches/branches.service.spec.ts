import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { Branch } from './branch.entity';

describe('BranchesService', () => {
  let service: BranchesService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findOneBy.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: getRepositoryToken(Branch), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(BranchesService);
  });

  it('creates a branch', async () => {
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'b1', ...data }),
    );

    const branch = await service.create({ name: 'Downtown' });

    expect(branch).toEqual({ id: 'b1', name: 'Downtown' });
  });

  it('rejects with ConflictException when a branch with the same name already exists', async () => {
    mockRepo.findOneBy.mockResolvedValue({ id: 'existing', name: 'Downtown' });

    await expect(service.create({ name: 'Downtown' })).rejects.toThrow(
      ConflictException,
    );

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('lists branches by a given set of ids', async () => {
    mockRepo.find.mockResolvedValue([{ id: 'b1', name: 'Downtown' }]);

    const branches = await service.findByIds(['b1']);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { id: expect.anything() },
    });
    expect(branches).toHaveLength(1);
  });

  it('returns all branches', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'b1', name: 'Downtown' },
      { id: 'b2', name: 'Uptown' },
    ]);

    const branches = await service.findAll();

    expect(mockRepo.find).toHaveBeenCalledWith();
    expect(branches).toHaveLength(2);
  });

  it('returns an empty list when given no ids', async () => {
    mockRepo.find.mockResolvedValue([]);

    const branches = await service.findByIds([]);

    expect(branches).toEqual([]);
  });

  describe('findById', () => {
    it('returns the branch when it exists', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: 'b1', name: 'Downtown' });

      const branch = await service.findById('b1');

      expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: 'b1' });
      expect(branch).toEqual({ id: 'b1', name: 'Downtown' });
    });

    it('throws NotFoundException when the branch does not exist', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        'Branch not found',
      );
    });
  });
});
