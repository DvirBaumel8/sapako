import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BranchesController } from './branches.controller';
import { CreateBranchDto } from './dto/create-branch.dto';
import { Role } from '../users/role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('BranchesController', () => {
  let controller: BranchesController;
  const mockBranchesService = {
    findAll: jest.fn(),
    findByIds: jest.fn(),
    create: jest.fn(),
  };
  const mockPermissionsService = {
    getAccessibleBranchIds: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BranchesController(
      mockBranchesService as any,
      mockPermissionsService as any,
    );
  });

  describe('guards', () => {
    it('requires authentication for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, BranchesController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);

      // No class-level @Roles: any authenticated role may reach findAccessible.
      expect(
        Reflect.getMetadata(ROLES_KEY, BranchesController),
      ).toBeUndefined();
    });

    it('restricts creating a branch to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        BranchesController.prototype.create,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('leaves findAccessible open to any authenticated role', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        BranchesController.prototype.findAccessible,
      );
      expect(roles).toBeUndefined();
    });
  });

  describe('findAccessible', () => {
    it('returns every branch when access resolves to ALL', async () => {
      mockPermissionsService.getAccessibleBranchIds.mockResolvedValue('ALL');
      const allBranches = [{ id: 'b1' }, { id: 'b2' }];
      mockBranchesService.findAll.mockResolvedValue(allBranches);
      const req = { user: { userId: 'admin1', role: Role.ADMIN } };

      const result = await controller.findAccessible(req);

      expect(
        mockPermissionsService.getAccessibleBranchIds,
      ).toHaveBeenCalledWith(req.user);
      expect(mockBranchesService.findAll).toHaveBeenCalledTimes(1);
      expect(mockBranchesService.findByIds).not.toHaveBeenCalled();
      expect(result).toBe(allBranches);
    });

    it('returns only the accessible branches for a restricted user', async () => {
      mockPermissionsService.getAccessibleBranchIds.mockResolvedValue(['b1']);
      const branches = [{ id: 'b1' }];
      mockBranchesService.findByIds.mockResolvedValue(branches);
      const req = { user: { userId: 'staff1', role: Role.STAFF } };

      const result = await controller.findAccessible(req);

      expect(mockBranchesService.findByIds).toHaveBeenCalledWith(['b1']);
      expect(mockBranchesService.findAll).not.toHaveBeenCalled();
      expect(result).toBe(branches);
    });
  });

  describe('create', () => {
    it('delegates to the branches service with the given dto', () => {
      const dto: CreateBranchDto = { name: 'סניף בדיקה' };
      const created = { id: 'b1', name: 'סניף בדיקה' };
      mockBranchesService.create.mockResolvedValue(created);

      const result = controller.create(dto);

      expect(mockBranchesService.create).toHaveBeenCalledWith(dto);
      return expect(result).resolves.toBe(created);
    });
  });

  describe('CreateBranchDto validation', () => {
    it('accepts a well-formed payload, address included', async () => {
      const dto = plainToInstance(CreateBranchDto, {
        name: 'סניף בדיקה',
        address: 'הרצל 1',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('accepts a payload with the optional address omitted', async () => {
      const dto = plainToInstance(CreateBranchDto, { name: 'סניף בדיקה' });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects a payload missing the required name', async () => {
      const dto = plainToInstance(CreateBranchDto, { address: 'הרצל 1' });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('name');
    });

    it('rejects an empty name', async () => {
      const dto = plainToInstance(CreateBranchDto, { name: '' });

      const errors = await validate(dto);

      const nameError = errors.find((error) => error.property === 'name');
      expect(nameError).toBeDefined();
      expect(nameError?.constraints).toHaveProperty('isNotEmpty');
    });
  });
});
