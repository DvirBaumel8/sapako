import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { DepartmentsService } from './departments.service';
import { Department } from './department.entity';
import { BranchesService } from '../branches/branches.service';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
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
        DepartmentsService,
        { provide: getRepositoryToken(Department), useValue: mockRepo },
        { provide: BranchesService, useValue: mockBranchesService },
      ],
    }).compile();
    service = module.get(DepartmentsService);
  });

  it('creates a department under a branch that exists', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'd1', ...data }),
    );

    const department = await service.create('b1', { name: 'מוצרי חלב' });

    expect(mockBranchesService.findById).toHaveBeenCalledWith('b1');
    expect(department).toMatchObject({
      id: 'd1',
      branchId: 'b1',
      name: 'מוצרי חלב',
    });
  });

  it('rejects with NotFoundException when the branch does not exist, without saving', async () => {
    mockBranchesService.findById.mockRejectedValue(
      new NotFoundException('Branch not found'),
    );

    await expect(
      service.create('missing', { name: 'מוצרי חלב' }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('lists all departments (active and inactive) for a branch', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'd1', name: 'מוצרי חלב', isActive: true },
      { id: 'd2', name: 'ישן', isActive: false },
    ]);

    const departments = await service.findAllForBranch('b1');

    expect(mockRepo.find).toHaveBeenCalledWith({ where: { branchId: 'b1' } });
    expect(departments).toHaveLength(2);
  });

  it('finds departments by a list of ids', async () => {
    mockRepo.find.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);

    const departments = await service.findByIds(['d1', 'd2']);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { id: In(['d1', 'd2']) },
    });
    expect(departments).toHaveLength(2);
  });

  it('returns an empty array from findByIds without querying when given no ids', async () => {
    const departments = await service.findByIds([]);

    expect(mockRepo.find).not.toHaveBeenCalled();
    expect(departments).toEqual([]);
  });

  it('throws NotFoundException when finding a department by an unknown id', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      'Department not found',
    );
  });

  it('updates a department and persists the merged fields', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'd1',
      branchId: 'b1',
      name: 'מוצרי חלב',
      isActive: true,
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('d1', {
      name: 'מוצרי חלב ומעדנים',
      isActive: false,
    });

    expect(updated).toMatchObject({
      id: 'd1',
      name: 'מוצרי חלב ומעדנים',
      isActive: false,
    });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'מוצרי חלב ומעדנים', isActive: false }),
    );
  });
});
