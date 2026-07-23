import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../users/role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  const buildContext = (user?: { role: Role }): ExecutionContext => {
    const getRequest = jest.fn(() => ({ user }));
    const switchToHttp = jest.fn(() => ({ getRequest }));
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(reflector);
  });

  it('passes through when no @Roles() metadata is present, without touching request.user', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const context = buildContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
    expect(context.switchToHttp).not.toHaveBeenCalled();
  });

  it('passes through when @Roles() is applied with an empty array', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);
    const context = buildContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request when the user role matches a required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
    const context = buildContext({ role: Role.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the user role does not match a required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
    const context = buildContext({ role: Role.STAFF });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
