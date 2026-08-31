import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthController } from './auth.controller';
import { LoginDto } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  const mockAuthService = { login: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(mockAuthService as any);
  });

  describe('login', () => {
    it('delegates to the service with the credentials from the body', async () => {
      const token = { accessToken: 'jwt-token' };
      mockAuthService.login.mockResolvedValue(token);

      const result = await controller.login({
        username: 'staff1',
        password: 'password123',
      });

      expect(mockAuthService.login).toHaveBeenCalledWith(
        'staff1',
        'password123',
      );
      expect(result).toBe(token);
    });

    it('lets the service’s rejection through rather than swallowing it', async () => {
      // The controller must not convert a failed login into a success or a
      // different status: the 401 the service throws is what the app reads
      // to tell a wrong password from a server fault.
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      await expect(
        controller.login({ username: 'staff1', password: 'wrong' }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('carries no guards, since logging in is how a caller gets a token', () => {
      // A guard here would be unauthenticatable by construction — there is no
      // token to present yet. This asserts the route stays reachable if
      // guards are ever applied more broadly.
      const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController);

      expect(guards).toBeUndefined();
    });
  });

  describe('LoginDto validation', () => {
    it('accepts a well-formed payload', async () => {
      const dto = plainToInstance(LoginDto, {
        username: 'staff1',
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it.each([
      ['username', { password: 'password123' }],
      ['password', { username: 'staff1' }],
    ])('rejects a payload missing %s', async (missing, payload) => {
      const dto = plainToInstance(LoginDto, payload);

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain(missing);
    });

    it.each([
      ['username', { username: '', password: 'password123' }],
      ['password', { username: 'staff1', password: '' }],
    ])('rejects an empty %s', async (empty, payload) => {
      const dto = plainToInstance(LoginDto, payload);

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain(empty);
    });

    it('rejects a non-string username, so no object reaches the query', async () => {
      const dto = plainToInstance(LoginDto, {
        username: { $ne: null },
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('username');
    });
  });
});
