import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';
import { CreateUserDto } from './dto/create-user.dto';
import { Role } from './role.enum';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('UsersController', () => {
  let controller: UsersController;
  const mockUsersService = {
    findAllWithAccess: jest.fn(),
    toSafeUser: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    remove: jest.fn(),
  };
  const mockPermissionsService = {
    getAccessForBranch: jest.fn(),
    setProviderAccess: jest.fn(),
    setDepartmentAccess: jest.fn(),
    setBranchAccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
    it('delegates to the users service and maps each user through toSafeUser', async () => {
      const rawUsers = [{ id: 'u1' }, { id: 'u2' }];
      const safeUsers = [
        { id: 'u1', safe: true },
        { id: 'u2', safe: true },
      ];
      mockUsersService.findAllWithAccess.mockResolvedValue(rawUsers);
      mockUsersService.toSafeUser.mockImplementation((user: any) => ({
        ...user,
        safe: true,
      }));

      const result = await controller.findAll();

      expect(mockUsersService.findAllWithAccess).toHaveBeenCalledTimes(1);
      expect(mockUsersService.toSafeUser).toHaveBeenCalledTimes(2);
      expect(result).toEqual(safeUsers);
    });
  });

  describe('create', () => {
    it('delegates to the users service and returns it through toSafeUser', async () => {
      const dto: CreateUserDto = {
        username: 'staff1',
        password: 'password123',
        role: Role.STAFF,
      };
      const created = { id: 'u1', username: 'staff1' };
      const safeUser = { id: 'u1', username: 'staff1', safe: true };
      mockUsersService.create.mockResolvedValue(created);
      mockUsersService.toSafeUser.mockReturnValue(safeUser);

      const result = await controller.create(dto);

      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
      expect(mockUsersService.toSafeUser).toHaveBeenCalledWith(created);
      expect(result).toBe(safeUser);
    });
  });

  describe('remove', () => {
    it('delegates to the users service with the given id', () => {
      controller.remove('u1');

      expect(mockUsersService.remove).toHaveBeenCalledWith('u1');
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
});
