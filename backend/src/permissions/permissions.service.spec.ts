import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { PermissionsService } from './permissions.service';
import { UserProviderAccess } from './user-provider-access.entity';
import { UserDepartmentAccess } from './user-department-access.entity';
import { UserProviderBlock } from './user-provider-block.entity';
import { Provider } from '../providers/provider.entity';
import { Department } from '../departments/department.entity';
import { Role } from '../users/role.enum';

describe('PermissionsService', () => {
  let service: PermissionsService;
  const directRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const departmentAccessRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const blockRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const providerRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const departmentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    directRepo.find.mockResolvedValue([]);
    departmentAccessRepo.find.mockResolvedValue([]);
    blockRepo.find.mockResolvedValue([]);
    providerRepo.find.mockResolvedValue([]);
    departmentRepo.find.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: getRepositoryToken(UserProviderAccess),
          useValue: directRepo,
        },
        {
          provide: getRepositoryToken(UserDepartmentAccess),
          useValue: departmentAccessRepo,
        },
        { provide: getRepositoryToken(UserProviderBlock), useValue: blockRepo },
        { provide: getRepositoryToken(Provider), useValue: providerRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
      ],
    }).compile();
    service = module.get(PermissionsService);
  });

  describe('hasProviderAccess', () => {
    it('grants ADMIN access to any provider without a lookup', async () => {
      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.ADMIN },
        'p1',
      );

      expect(allowed).toBe(true);
      expect(directRepo.find).not.toHaveBeenCalled();
    });

    it('grants STAFF access when a matching direct access row exists', async () => {
      directRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);
      providerRepo.findOne.mockResolvedValue({ id: 'p1', departments: [] });

      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.STAFF },
        'p1',
      );

      expect(allowed).toBe(true);
    });

    it('denies STAFF access when no access row exists', async () => {
      // The provider exists; it is the absence of a rule that denies, not a
      // missing row.
      providerRepo.findOne.mockResolvedValue({ id: 'p1', departments: [] });

      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.STAFF },
        'p1',
      );

      expect(allowed).toBe(false);
    });

    it('denies STAFF access to a provider granted to a different user', async () => {
      // The mock does not itself filter by userId, so this only proves the
      // service scopes the query correctly, not that a real join does too.
      providerRepo.findOne.mockResolvedValue({ id: 'p1', departments: [] });

      const allowed = await service.hasProviderAccess(
        { userId: 'u2', role: Role.STAFF },
        'p1',
      );

      expect(directRepo.find).toHaveBeenCalledWith({ where: { userId: 'u2' } });
      expect(allowed).toBe(false);
    });

    it('grants access to a provider reachable only through a granted department', () => {
      providerRepo.findOne.mockResolvedValue({
        id: 'p1',
        branchId: 'b1',
        departments: [{ id: 'd1', name: 'חלב' }],
      });
      departmentAccessRepo.find.mockResolvedValue([
        { userId: 'u1', departmentId: 'd1' },
      ]);

      return service
        .hasProviderAccess({ userId: 'u1', role: Role.STAFF }, 'p1')
        .then((allowed) => {
          expect(allowed).toBe(true);
        });
    });

    it('denies access to a blocked provider even when directly granted', async () => {
      providerRepo.find.mockResolvedValue([
        { id: 'p1', branchId: 'b1', departments: [] },
      ]);
      directRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);
      blockRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);

      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.STAFF },
        'p1',
      );

      expect(allowed).toBe(false);
    });
  });

  describe('getAccessibleBranchIds', () => {
    it("returns 'ALL' for ADMIN", async () => {
      const result = await service.getAccessibleBranchIds({
        userId: 'u1',
        role: Role.ADMIN,
      });

      expect(result).toBe('ALL');
    });

    it('derives distinct branch ids from granted providers for STAFF', async () => {
      directRepo.find.mockResolvedValue([
        { userId: 'u1', providerId: 'p1' },
        { userId: 'u1', providerId: 'p2' },
        { userId: 'u1', providerId: 'p3' },
      ]);
      providerRepo.find.mockResolvedValue([
        { id: 'p1', branchId: 'b1', departments: [] },
        { id: 'p2', branchId: 'b1', departments: [] },
        { id: 'p3', branchId: 'b2', departments: [] },
      ]);

      const result = await service.getAccessibleBranchIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual(expect.arrayContaining(['b1', 'b2']));
      expect(result).toHaveLength(2);
    });

    it('returns an empty array for STAFF with no granted providers', async () => {
      const result = await service.getAccessibleBranchIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual([]);
    });

    it('includes a branch reachable only via a department grant', async () => {
      // Plural find: unlike the single-provider guard, this genuinely needs
      // every provider in order to collect the branches they sit in.
      providerRepo.find.mockResolvedValue([
        { id: 'p1', branchId: 'b1', departments: [{ id: 'd1', name: 'חלב' }] },
      ]);
      departmentAccessRepo.find.mockResolvedValue([
        { userId: 'u1', departmentId: 'd1' },
      ]);

      const result = await service.getAccessibleBranchIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual(['b1']);
    });
  });

  describe('hasBranchAccess', () => {
    it('grants ADMIN access to any branch', async () => {
      const allowed = await service.hasBranchAccess(
        { userId: 'u1', role: Role.ADMIN },
        'b1',
      );

      expect(allowed).toBe(true);
    });

    it('denies STAFF access to a branch with no granted providers', async () => {
      const allowed = await service.hasBranchAccess(
        { userId: 'u1', role: Role.STAFF },
        'b1',
      );

      expect(allowed).toBe(false);
    });

    it('grants STAFF access to a branch reachable via a granted provider', async () => {
      directRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);
      providerRepo.find.mockResolvedValue([
        { id: 'p1', branchId: 'b1', departments: [] },
      ]);

      const allowed = await service.hasBranchAccess(
        { userId: 'u1', role: Role.STAFF },
        'b1',
      );

      expect(allowed).toBe(true);
    });

    it('denies STAFF access to a branch not reachable via any granted provider', async () => {
      directRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);
      providerRepo.find.mockResolvedValue([
        { id: 'p1', branchId: 'b1', departments: [] },
      ]);

      const allowed = await service.hasBranchAccess(
        { userId: 'u1', role: Role.STAFF },
        'b2',
      );

      expect(allowed).toBe(false);
    });
  });

  describe('getAccessibleProviderIds', () => {
    it("returns 'ALL' for ADMIN without a lookup", async () => {
      const result = await service.getAccessibleProviderIds({
        userId: 'u1',
        role: Role.ADMIN,
      });

      expect(result).toBe('ALL');
      expect(directRepo.find).not.toHaveBeenCalled();
    });

    it('returns the granted provider ids for STAFF', async () => {
      directRepo.find.mockResolvedValue([
        { userId: 'u1', providerId: 'p1' },
        { userId: 'u1', providerId: 'p2' },
      ]);
      providerRepo.find.mockResolvedValue([
        { id: 'p1', branchId: 'b1', departments: [] },
        { id: 'p2', branchId: 'b1', departments: [] },
      ]);

      const result = await service.getAccessibleProviderIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual(['p1', 'p2']);
    });

    it('returns an empty array for STAFF with no granted providers', async () => {
      const result = await service.getAccessibleProviderIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual([]);
    });

    it('excludes a blocked provider even though it is directly granted', async () => {
      // The list endpoints (branch providers, branch products) go through
      // this method, not hasProviderAccess — nothing else in this file
      // proves a block is honoured on that path rather than only on the
      // single-provider guard path.
      directRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);
      blockRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);
      providerRepo.find.mockResolvedValue([
        { id: 'p1', branchId: 'b1', departments: [] },
      ]);

      const result = await service.getAccessibleProviderIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getAccessForBranch', () => {
    it('reports each provider with its reason', async () => {
      directRepo.find.mockResolvedValue([{ providerId: 'p1' }]);
      departmentAccessRepo.find.mockResolvedValue([{ departmentId: 'd1' }]);
      blockRepo.find.mockResolvedValue([{ providerId: 'p3' }]);
      providerRepo.find.mockResolvedValue([
        { id: 'p1', name: 'אוסם', departments: [] },
        { id: 'p2', name: 'תנובה', departments: [{ id: 'd1', name: 'חלב' }] },
        { id: 'p3', name: 'שטראוס', departments: [{ id: 'd1', name: 'חלב' }] },
      ]);
      departmentRepo.find.mockResolvedValue([{ id: 'd1', name: 'חלב' }]);

      const result = await service.getAccessForBranch('u1', 'b1');

      expect(result.departments).toEqual([
        { id: 'd1', name: 'חלב', isGranted: true },
      ]);
      expect(result.providers).toEqual([
        { id: 'p1', name: 'אוסם', isGranted: true, reason: 'DIRECT' },
        {
          id: 'p2',
          name: 'תנובה',
          isGranted: true,
          reason: 'DEPARTMENT',
          viaDepartmentName: 'חלב',
        },
        {
          id: 'p3',
          name: 'שטראוס',
          isGranted: false,
          reason: 'BLOCKED',
          viaDepartmentName: 'חלב',
        },
      ]);
    });
  });

  describe('grant', () => {
    it('creates and saves a new access row', async () => {
      const created = { userId: 'u1', providerId: 'p1' };
      directRepo.create.mockReturnValue(created);
      directRepo.save.mockResolvedValue(created);

      const result = await service.grant('u1', 'p1');

      expect(directRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
      expect(directRepo.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });
  });

  describe('revoke', () => {
    it('deletes the access row for the given user and provider', async () => {
      directRepo.delete.mockResolvedValue({ affected: 1 });

      await service.revoke('u1', 'p1');

      expect(directRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
    });
  });

  describe('hasProviderAccess cost', () => {
    it('reads only the provider being asked about', async () => {
      // This runs in a guard, on every provider-scoped request. Resolving one
      // provider by loading every provider in the branch — with its
      // departments joined — put a full scan on the authorisation path.
      directRepo.find.mockResolvedValue([]);
      departmentAccessRepo.find.mockResolvedValue([{ departmentId: 'd1' }]);
      blockRepo.find.mockResolvedValue([]);
      providerRepo.findOne.mockResolvedValue({
        id: 'p1',
        departments: [{ id: 'd1', name: 'חלב' }],
      });

      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.STAFF } as never,
        'p1',
      );

      expect(allowed).toBe(true);
      expect(providerRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'p1' },
        relations: { departments: true },
      });
      expect(providerRepo.find).not.toHaveBeenCalled();
    });

    it('denies a provider that does not exist', async () => {
      directRepo.find.mockResolvedValue([]);
      departmentAccessRepo.find.mockResolvedValue([]);
      blockRepo.find.mockResolvedValue([]);
      providerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.hasProviderAccess(
          { userId: 'u1', role: Role.STAFF } as never,
          'nope',
        ),
      ).resolves.toBe(false);
    });
  });

  describe('setProviderAccess', () => {
    it('removes the block rather than adding a grant when a department already grants it', async () => {
      departmentAccessRepo.find.mockResolvedValue([{ departmentId: 'd1' }]);
      providerRepo.findOne.mockResolvedValue({
        id: 'p1',
        departments: [{ id: 'd1', name: 'חלב' }],
      });

      await service.setProviderAccess('u1', 'p1', true);

      expect(blockRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
      expect(directRepo.save).not.toHaveBeenCalled();
    });

    it('adds a direct grant when nothing else would reach the provider', async () => {
      departmentAccessRepo.find.mockResolvedValue([]);
      providerRepo.findOne.mockResolvedValue({ id: 'p1', departments: [] });

      await service.setProviderAccess('u1', 'p1', true);

      expect(directRepo.save).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
    });

    it('blocks a department-granted provider when switched off', async () => {
      departmentAccessRepo.find.mockResolvedValue([{ departmentId: 'd1' }]);
      providerRepo.findOne.mockResolvedValue({
        id: 'p1',
        departments: [{ id: 'd1', name: 'חלב' }],
      });

      await service.setProviderAccess('u1', 'p1', false);

      expect(blockRepo.save).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
    });

    it('only removes the grant when switching off a directly granted provider', async () => {
      // Adding a block here too would be redundant, and would outlive the grant
      // as a dormant rule nobody asked for.
      departmentAccessRepo.find.mockResolvedValue([]);
      providerRepo.findOne.mockResolvedValue({ id: 'p1', departments: [] });

      await service.setProviderAccess('u1', 'p1', false);

      expect(directRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
      expect(blockRepo.save).not.toHaveBeenCalled();
    });

    it('never leaves a direct grant and a block in place together', async () => {
      departmentAccessRepo.find.mockResolvedValue([]);
      providerRepo.findOne.mockResolvedValue({ id: 'p1', departments: [] });

      await service.setProviderAccess('u1', 'p1', true);

      expect(blockRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
    });

    it('throws NotFoundException for a provider that does not exist', async () => {
      providerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setProviderAccess('u1', 'nope', true),
      ).rejects.toThrow(NotFoundException);
      expect(directRepo.save).not.toHaveBeenCalled();
      expect(blockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('setDepartmentAccess', () => {
    it('leaves a direct grant inside the department intact when revoked', async () => {
      // Spec section 3.3: the two rules are independent, and dropping one
      // because an unrelated one was withdrawn would be surprising.
      await service.setDepartmentAccess('u1', 'd1', false);

      expect(departmentAccessRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        departmentId: 'd1',
      });
      expect(directRepo.delete).not.toHaveBeenCalled();
    });

    it('grants the department', async () => {
      // The feature's main happy path, previously unexercised: everything
      // else in this describe block only covers revocation.
      await service.setDepartmentAccess('u1', 'd1', true);

      expect(departmentAccessRepo.save).toHaveBeenCalledWith({
        userId: 'u1',
        departmentId: 'd1',
      });
      expect(departmentAccessRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('setBranchAccess', () => {
    it('leaves the other branch untouched when clearing one', async () => {
      providerRepo.find.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      departmentRepo.find.mockResolvedValue([{ id: 'd1' }]);

      await service.setBranchAccess('u1', 'b1', false);

      expect(directRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: In(['p1', 'p2']),
      });
      expect(departmentAccessRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        departmentId: In(['d1']),
      });
    });

    it('makes no writes and does not throw for a branch with no providers', async () => {
      // Not hypothetical: נתניה is exactly this today. Every write in the
      // method is keyed off providerIds, so this only passes if the early
      // return is actually reached rather than one of the deletes running
      // with an empty In([]).
      providerRepo.find.mockResolvedValue([]);
      departmentRepo.find.mockResolvedValue([]);

      await expect(
        service.setBranchAccess('u1', 'b1', true),
      ).resolves.toBeUndefined();

      expect(directRepo.save).not.toHaveBeenCalled();
      expect(directRepo.delete).not.toHaveBeenCalled();
      expect(blockRepo.save).not.toHaveBeenCalled();
      expect(blockRepo.delete).not.toHaveBeenCalled();
      expect(departmentAccessRepo.delete).not.toHaveBeenCalled();
    });

    it('grants every provider in the branch and clears existing blocks', async () => {
      providerRepo.find.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      departmentRepo.find.mockResolvedValue([{ id: 'd1' }]);

      await service.setBranchAccess('u1', 'b1', true);

      expect(blockRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: In(['p1', 'p2']),
      });
      expect(directRepo.save).toHaveBeenCalledWith([
        { userId: 'u1', providerId: 'p1' },
        { userId: 'u1', providerId: 'p2' },
      ]);
      expect(directRepo.delete).not.toHaveBeenCalled();
      expect(departmentAccessRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('missing departments relation', () => {
    // The `?? []` fallback at each of the four call sites exists for a
    // provider fetched without the departments relation joined at all —
    // not one joined to zero departments, which every other test in this
    // file uses. Nothing before this proved the fallback actually works.

    it('hasProviderAccess treats it as empty rather than throwing', async () => {
      providerRepo.findOne.mockResolvedValue({ id: 'p1' });

      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.STAFF },
        'p1',
      );

      expect(allowed).toBe(false);
    });

    it('getAccessibleBranchIds treats it as empty rather than throwing', async () => {
      directRepo.find.mockResolvedValue([{ userId: 'u1', providerId: 'p1' }]);
      providerRepo.find.mockResolvedValue([{ id: 'p1', branchId: 'b1' }]);

      const result = await service.getAccessibleBranchIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual(['b1']);
    });

    it('getAccessForBranch treats it as empty rather than throwing', async () => {
      providerRepo.find.mockResolvedValue([{ id: 'p1', name: 'אוסם' }]);
      departmentRepo.find.mockResolvedValue([]);

      const result = await service.getAccessForBranch('u1', 'b1');

      expect(result.providers).toEqual([
        { id: 'p1', name: 'אוסם', isGranted: false, reason: 'NONE' },
      ]);
    });

    it('setProviderAccess treats it as empty rather than throwing', async () => {
      departmentAccessRepo.find.mockResolvedValue([]);
      providerRepo.findOne.mockResolvedValue({ id: 'p1' });

      await service.setProviderAccess('u1', 'p1', true);

      expect(directRepo.save).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
    });
  });
});
