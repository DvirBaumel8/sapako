import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  BranchDepartmentsController,
  DepartmentAdminController,
} from './departments.controller';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Role } from '../users/role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BranchAccessGuard } from '../permissions/branch-access.guard';

// Unit-level companion to test/authorization.e2e-spec.ts: that file proves
// the guards behave correctly against a real request; this proves each
// route delegates to the service with the right arguments and carries the
// guard/role metadata that behavioural test relies on.
describe('BranchDepartmentsController', () => {
  let controller: BranchDepartmentsController;
  const mockDepartmentsService = {
    findAllForBranch: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BranchDepartmentsController(mockDepartmentsService as any);
  });

  describe('guards', () => {
    it('requires authentication and branch access for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, BranchDepartmentsController);
      expect(guards).toEqual([JwtAuthGuard, BranchAccessGuard, RolesGuard]);
    });

    it('restricts creating a department to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        BranchDepartmentsController.prototype.create,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('leaves listing open to any authenticated role with branch access', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        BranchDepartmentsController.prototype.findForBranch,
      );
      expect(roles).toBeUndefined();
    });
  });

  describe('findForBranch', () => {
    it('delegates to the service with the branch id', async () => {
      const departments = [{ id: 'd1' }];
      mockDepartmentsService.findAllForBranch.mockResolvedValue(departments);

      const result = await controller.findForBranch('b1');

      expect(mockDepartmentsService.findAllForBranch).toHaveBeenCalledWith('b1');
      expect(result).toBe(departments);
    });
  });

  describe('create', () => {
    it('delegates to the service with the branch id and dto', async () => {
      const dto: CreateDepartmentDto = { name: 'חלב' };
      const created = { id: 'd1', name: 'חלב' };
      mockDepartmentsService.create.mockResolvedValue(created);

      const result = await controller.create('b1', dto);

      expect(mockDepartmentsService.create).toHaveBeenCalledWith('b1', dto);
      expect(result).toBe(created);
    });
  });
});

describe('DepartmentAdminController', () => {
  let controller: DepartmentAdminController;
  const mockDepartmentsService = {
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DepartmentAdminController(mockDepartmentsService as any);
  });

  describe('guards', () => {
    it('requires authentication for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, DepartmentAdminController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('restricts updating a department to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        DepartmentAdminController.prototype.update,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('restricts removing a department to ADMIN', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        DepartmentAdminController.prototype.remove,
      );
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('update', () => {
    it('delegates to the service with the id and dto', async () => {
      const dto: UpdateDepartmentDto = { name: 'חלב ומוצריו' };
      const updated = { id: 'd1', name: 'חלב ומוצריו' };
      mockDepartmentsService.update.mockResolvedValue(updated);

      const result = await controller.update('d1', dto);

      expect(mockDepartmentsService.update).toHaveBeenCalledWith('d1', dto);
      expect(result).toBe(updated);
    });
  });

  describe('remove', () => {
    it('delegates to the service with the id', async () => {
      mockDepartmentsService.remove.mockResolvedValue(undefined);

      await controller.remove('d1');

      expect(mockDepartmentsService.remove).toHaveBeenCalledWith('d1');
    });
  });
});
