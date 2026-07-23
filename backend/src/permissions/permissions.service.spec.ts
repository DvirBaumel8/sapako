import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { UserProviderAccess } from './user-provider-access.entity';
import { Role } from '../users/role.enum';

describe('PermissionsService', () => {
  let service: PermissionsService;
  const mockRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: getRepositoryToken(UserProviderAccess), useValue: mockRepo },
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
      expect(mockRepo.findOne).not.toHaveBeenCalled();
    });

    it('grants STAFF access when a matching access row exists', async () => {
      mockRepo.findOne.mockResolvedValue({ userId: 'u1', providerId: 'p1' });

      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.STAFF },
        'p1',
      );

      expect(allowed).toBe(true);
    });

    it('denies STAFF access when no access row exists', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const allowed = await service.hasProviderAccess(
        { userId: 'u1', role: Role.STAFF },
        'p1',
      );

      expect(allowed).toBe(false);
    });

    it('denies STAFF access to a provider granted to a different user', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const allowed = await service.hasProviderAccess(
        { userId: 'u2', role: Role.STAFF },
        'p1',
      );

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'u2', providerId: 'p1' },
      });
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
      mockRepo.find.mockResolvedValue([
        {
          userId: 'u1',
          providerId: 'p1',
          provider: { id: 'p1', branchId: 'b1' },
        },
        {
          userId: 'u1',
          providerId: 'p2',
          provider: { id: 'p2', branchId: 'b1' },
        },
        {
          userId: 'u1',
          providerId: 'p3',
          provider: { id: 'p3', branchId: 'b2' },
        },
      ]);

      const result = await service.getAccessibleBranchIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual(expect.arrayContaining(['b1', 'b2']));
      expect(result).toHaveLength(2);
    });

    it('returns an empty array for STAFF with no granted providers', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await service.getAccessibleBranchIds({
        userId: 'u1',
        role: Role.STAFF,
      });

      expect(result).toEqual([]);
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
      mockRepo.find.mockResolvedValue([]);

      const allowed = await service.hasBranchAccess(
        { userId: 'u1', role: Role.STAFF },
        'b1',
      );

      expect(allowed).toBe(false);
    });

    it('grants STAFF access to a branch reachable via a granted provider', async () => {
      mockRepo.find.mockResolvedValue([
        {
          userId: 'u1',
          providerId: 'p1',
          provider: { id: 'p1', branchId: 'b1' },
        },
      ]);

      const allowed = await service.hasBranchAccess(
        { userId: 'u1', role: Role.STAFF },
        'b1',
      );

      expect(allowed).toBe(true);
    });

    it('denies STAFF access to a branch not reachable via any granted provider', async () => {
      mockRepo.find.mockResolvedValue([
        {
          userId: 'u1',
          providerId: 'p1',
          provider: { id: 'p1', branchId: 'b1' },
        },
      ]);

      const allowed = await service.hasBranchAccess(
        { userId: 'u1', role: Role.STAFF },
        'b2',
      );

      expect(allowed).toBe(false);
    });
  });

  describe('grant', () => {
    it('creates and saves a new access row', async () => {
      const created = { userId: 'u1', providerId: 'p1' };
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);

      const result = await service.grant('u1', 'p1');

      expect(mockRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
      expect(mockRepo.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });
  });

  describe('revoke', () => {
    it('deletes the access row for the given user and provider', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.revoke('u1', 'p1');

      expect(mockRepo.delete).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
      });
    });
  });
});
