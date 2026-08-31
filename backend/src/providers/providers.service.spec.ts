// backend/src/providers/providers.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { ProvidersService } from './providers.service';
import { Provider } from './provider.entity';
import { BranchesService } from '../branches/branches.service';
import { DepartmentsService } from '../departments/departments.service';

describe('ProvidersService', () => {
  let service: ProvidersService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
  };
  const mockBranchesService = {
    findById: jest.fn(),
  };
  const mockDepartmentsService = {
    findByIds: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findOneBy.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: getRepositoryToken(Provider), useValue: mockRepo },
        { provide: BranchesService, useValue: mockBranchesService },
        { provide: DepartmentsService, useValue: mockDepartmentsService },
      ],
    }).compile();
    service = module.get(ProvidersService);
  });

  it('creates a provider under a branch that exists, attached to its departments', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd1', branchId: 'b1', name: 'מוצרי חלב' },
      { id: 'd2', branchId: 'b1', name: 'קפואים' },
    ]);
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'p1', ...data }),
    );

    const provider = await service.create('b1', {
      name: 'Meat Co',
      phone: '+972501234567',
      departmentIds: ['d1', 'd2'],
    });

    expect(mockBranchesService.findById).toHaveBeenCalledWith('b1');
    expect(mockDepartmentsService.findByIds).toHaveBeenCalledWith(['d1', 'd2']);
    expect(provider).toMatchObject({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      departments: [
        { id: 'd1', branchId: 'b1', name: 'מוצרי חלב' },
        { id: 'd2', branchId: 'b1', name: 'קפואים' },
      ],
    });
  });

  it('rejects with ConflictException when a provider with the same name already exists in the branch', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockRepo.findOneBy.mockResolvedValue({
      id: 'existing',
      branchId: 'b1',
      name: 'Meat Co',
    });

    await expect(
      service.create('b1', {
        name: 'Meat Co',
        phone: '+972501234567',
        departmentIds: [],
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundException when the branch does not exist, without saving', async () => {
    mockBranchesService.findById.mockRejectedValue(
      new NotFoundException('Branch not found'),
    );

    await expect(
      service.create('missing', {
        name: 'Meat Co',
        phone: '+972501234567',
        departmentIds: ['d1'],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundException when a departmentId does not exist, without saving', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd1', branchId: 'b1', name: 'מוצרי חלב' },
    ]);

    await expect(
      service.create('b1', {
        name: 'Meat Co',
        phone: '+972501234567',
        departmentIds: ['d1', 'missing'],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundException when a departmentId belongs to a different branch, without saving', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd1', branchId: 'OTHER_BRANCH', name: 'מוצרי חלב' },
    ]);

    await expect(
      service.create('b1', {
        name: 'Meat Co',
        phone: '+972501234567',
        departmentIds: ['d1'],
      }),
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
      relations: { departments: true },
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
      relations: { departments: true },
    });
    expect(providers).toHaveLength(1);
  });

  it('lists all providers (active and inactive) for a branch', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'p1', name: 'Meat Co', isActive: true },
      { id: 'p2', name: 'Old Co', isActive: false },
    ]);

    const providers = await service.findAllForBranch('b1');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { branchId: 'b1' },
      relations: { departments: true },
    });
    expect(providers).toHaveLength(2);
  });

  it('throws NotFoundException when finding a provider by an unknown id', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      'Provider not found',
    );
  });

  it('updates a provider and persists the merged fields, without touching departments when omitted', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      phone: '+972501234567',
      isActive: true,
      departments: [{ id: 'd1', branchId: 'b1', name: 'מוצרי חלב' }],
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('p1', {
      name: 'Meat Co Ltd',
      isActive: false,
    });

    expect(mockDepartmentsService.findByIds).not.toHaveBeenCalled();
    expect(updated).toMatchObject({
      id: 'p1',
      name: 'Meat Co Ltd',
      isActive: false,
      departments: [{ id: 'd1', branchId: 'b1', name: 'מוצרי חלב' }],
    });
  });

  it('allows updating a provider without changing its name (no self-conflict)', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      isActive: true,
      departments: [],
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    await service.update('p1', { name: 'Meat Co', isActive: false });

    expect(mockRepo.findOneBy).not.toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('rejects update with ConflictException when renaming to a name already used in the branch', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      departments: [],
    });
    mockRepo.findOneBy.mockResolvedValue({
      id: 'p2',
      branchId: 'b1',
      name: 'Fish Co',
    });

    await expect(service.update('p1', { name: 'Fish Co' })).rejects.toThrow(
      ConflictException,
    );

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('replaces the department set on update when departmentIds is provided', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      departments: [{ id: 'd1', branchId: 'b1', name: 'מוצרי חלב' }],
    });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd2', branchId: 'b1', name: 'קפואים' },
    ]);
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('p1', { departmentIds: ['d2'] });

    expect(updated.departments).toEqual([
      { id: 'd2', branchId: 'b1', name: 'קפואים' },
    ]);
  });

  it('rejects update with NotFoundException when a departmentId belongs to a different branch, without saving', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      departments: [],
    });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd2', branchId: 'OTHER_BRANCH', name: 'קפואים' },
    ]);

    await expect(
      service.update('p1', { departmentIds: ['d2'] }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  describe('remove', () => {
    it('deletes a provider by id', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove('p1');

      expect(mockRepo.delete).toHaveBeenCalledWith({ id: 'p1' });
    });

    it('rejects removing a provider that does not exist', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
