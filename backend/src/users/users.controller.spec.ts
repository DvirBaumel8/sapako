import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from './role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('UsersController', () => {
  let controller: UsersController;
  const mockUsersService = {
    findAll: jest.fn(),
    toSafeUser: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };
  const mockPermissionsService = {
    getAccessForBranch: jest.fn(),
    setProviderAccess: jest.fn(),
    setDepartmentAccess: jest.fn(),
    setBranchAccess: jest.fn(),
    setAllDepartmentsAccess: jest.fn(),
    countAccessibleProviders: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionsService.countAccessibleProviders.mockResolvedValue(0);
    controller = new UsersController(
      mockUsersService as any,
      mockPermissionsService as any,
    );
  });

  describe('guards', () => {
    // The controller is admin-only end to end: every route in it manages
    // other users' accounts and access grants. A missing guard or role here
    // would open account/permission management to any authenticated user.
    it('requires authentication and the ADMIN role for the whole controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);

      const roles = Reflect.getMetadata(ROLES_KEY, UsersController);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('findAll', () => {
    it('delegates to the users service and maps each user through toSafeUser with its resolved access count', async () => {
      const rawUsers = [
        { id: 'u1', role: Role.STAFF },
        { id: 'u2', role: Role.ADMIN },
      ];
      const safeUsers = [
        { id: 'u1', role: Role.STAFF, safe: true },
        { id: 'u2', role: Role.ADMIN, safe: true },
      ];
      mockUsersService.findAll.mockResolvedValue(rawUsers);
      mockPermissionsService.countAccessibleProviders.mockImplementation(
        async (user: any) => (user.userId === 'u1' ? 5 : 10),
      );
      mockUsersService.toSafeUser.mockImplementation((user: any) => ({
        ...user,
        safe: true,
      }));

      const result = await controller.findAll();

      expect(mockUsersService.findAll).toHaveBeenCalledTimes(1);
      expect(mockPermissionsService.countAccessibleProviders).toHaveBeenCalledWith(
        { userId: 'u1', role: Role.STAFF },
      );
      expect(mockPermissionsService.countAccessibleProviders).toHaveBeenCalledWith(
        { userId: 'u2', role: Role.ADMIN },
      );
      expect(mockUsersService.toSafeUser).toHaveBeenCalledWith(rawUsers[0], 5);
      expect(mockUsersService.toSafeUser).toHaveBeenCalledWith(rawUsers[1], 10);
      expect(result).toEqual(safeUsers);
    });
  });

  describe('create', () => {
    it('delegates to the users service and returns it through toSafeUser with a resolved access count', async () => {
      const dto: CreateUserDto = {
        username: 'staff1',
        password: 'password123',
        role: Role.STAFF,
      };
      const created = { id: 'u1', username: 'staff1', role: Role.STAFF };
      const safeUser = { id: 'u1', username: 'staff1', safe: true };
      mockUsersService.create.mockResolvedValue(created);
      mockPermissionsService.countAccessibleProviders.mockResolvedValue(0);
      mockUsersService.toSafeUser.mockReturnValue(safeUser);

      const result = await controller.create(dto);

      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
      expect(mockPermissionsService.countAccessibleProviders).toHaveBeenCalledWith(
        { userId: 'u1', role: Role.STAFF },
      );
      expect(mockUsersService.toSafeUser).toHaveBeenCalledWith(created, 0);
      expect(result).toBe(safeUser);
    });
  });

  describe('remove', () => {
    it('delegates to the users service with the given id', () => {
      controller.remove('u1');

      expect(mockUsersService.remove).toHaveBeenCalledWith('u1');
    });
  });

  describe('update', () => {
    it('delegates the partial update and returns a safe user with a resolved access count', async () => {
      const dto: UpdateUserDto = { username: 'new-name', password: 'new-password' };
      const updated = { id: 'u1', username: 'new-name', role: Role.STAFF };
      const safeUser = { id: 'u1', username: 'new-name', safe: true };
      mockUsersService.update.mockResolvedValue(updated);
      mockPermissionsService.countAccessibleProviders.mockResolvedValue(3);
      mockUsersService.toSafeUser.mockReturnValue(safeUser);

      const result = await controller.update('u1', dto);

      expect(mockUsersService.update).toHaveBeenCalledWith('u1', dto);
      expect(mockPermissionsService.countAccessibleProviders).toHaveBeenCalledWith(
        { userId: 'u1', role: Role.STAFF },
      );
      expect(mockUsersService.toSafeUser).toHaveBeenCalledWith(updated, 3);
      expect(result).toBe(safeUser);
    });
  });

  describe('getAccess', () => {
    it('delegates to the permissions service for the given branch', () => {
      mockPermissionsService.getAccessForBranch.mockResolvedValue({
        departments: [],
        providers: [],
      });

      controller.getAccess('u1', 'b1');

      expect(mockPermissionsService.getAccessForBranch).toHaveBeenCalledWith(
        'u1',
        'b1',
      );
    });
  });

  describe('setProviderAccess', () => {
    it('delegates the intent to the permissions service', () => {
      controller.setProviderAccess('u1', 'p1', { granted: true });

      expect(mockPermissionsService.setProviderAccess).toHaveBeenCalledWith(
        'u1',
        'p1',
        true,
      );
    });
  });

  describe('setDepartmentAccess', () => {
    it('delegates the intent to the permissions service', () => {
      controller.setDepartmentAccess('u1', 'd1', { granted: false });

      expect(mockPermissionsService.setDepartmentAccess).toHaveBeenCalledWith(
        'u1',
        'd1',
        false,
      );
    });
  });

  describe('setAllDepartmentsAccess', () => {
    it('delegates to the service with the user, branch and intent', () => {
      controller.setAllDepartmentsAccess('u1', 'b1', { granted: true });

      expect(
        mockPermissionsService.setAllDepartmentsAccess,
      ).toHaveBeenCalledWith('u1', 'b1', true);
    });

    it('does not route to the branch-wide provider grant', () => {
      // The two are different mechanisms: this writes department rules, that
      // writes a direct grant per provider. Confusing them would silently
      // change what a later provider addition inherits.
      controller.setAllDepartmentsAccess('u1', 'b1', { granted: true });

      expect(mockPermissionsService.setBranchAccess).not.toHaveBeenCalled();
    });
  });

  describe('setBranchAccess', () => {
    it('delegates the intent to the permissions service', () => {
      controller.setBranchAccess('u1', 'b1', { granted: false });

      expect(mockPermissionsService.setBranchAccess).toHaveBeenCalledWith(
        'u1',
        'b1',
        false,
      );
    });
  });

  describe('CreateUserDto validation', () => {
    it('accepts a well-formed payload', async () => {
      const dto = plainToInstance(CreateUserDto, {
        username: 'staff1',
        password: 'password123',
        role: Role.STAFF,
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects a payload missing the required username', async () => {
      const dto = plainToInstance(CreateUserDto, {
        password: 'password123',
        role: Role.STAFF,
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('username');
    });

    it('rejects a password under eight characters', async () => {
      const dto = plainToInstance(CreateUserDto, {
        username: 'staff1',
        password: 'short1',
        role: Role.STAFF,
      });

      const errors = await validate(dto);

      const passwordError = errors.find(
        (error) => error.property === 'password',
      );
      expect(passwordError).toBeDefined();
      expect(passwordError?.constraints).toHaveProperty('minLength');
    });

    it('rejects a role outside ADMIN/STAFF', async () => {
      const dto = plainToInstance(CreateUserDto, {
        username: 'staff1',
        password: 'password123',
        role: 'SUPERUSER',
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('role');
    });
  });

  describe('UpdateUserDto validation', () => {
    it('accepts a username-only update', async () => {
      const dto = plainToInstance(UpdateUserDto, { username: 'new-name' });

      expect(await validate(dto)).toHaveLength(0);
    });

    it('accepts a password-only update', async () => {
      const dto = plainToInstance(UpdateUserDto, { password: 'new-password' });

      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a supplied password under eight characters', async () => {
      const dto = plainToInstance(UpdateUserDto, { password: 'short1' });

      const errors = await validate(dto);

      expect(errors.find((error) => error.property === 'password')?.constraints).toHaveProperty('minLength');
    });
  });
});
