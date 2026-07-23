import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ProviderAccessGuard } from './provider-access.guard';
import { Role } from '../users/role.enum';

function makeContext(user: any, params: any, body: any = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params, body }),
    }),
  } as unknown as ExecutionContext;
}

describe('ProviderAccessGuard', () => {
  const permissionsService = { hasProviderAccess: jest.fn() };
  const guard = new ProviderAccessGuard(permissionsService as any);

  beforeEach(() => jest.clearAllMocks());

  it('allows the request when the user has provider access', async () => {
    permissionsService.hasProviderAccess.mockResolvedValue(true);
    const context = makeContext(
      { userId: 'u1', role: Role.STAFF },
      { providerId: 'p1' },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('reads providerId from the body when not present in params', async () => {
    permissionsService.hasProviderAccess.mockResolvedValue(true);
    const context = makeContext(
      { userId: 'u1', role: Role.STAFF },
      {},
      { providerId: 'p1' },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(permissionsService.hasProviderAccess).toHaveBeenCalledWith(
      { userId: 'u1', role: Role.STAFF },
      'p1',
    );
  });

  it('throws ForbiddenException when the user lacks provider access', async () => {
    permissionsService.hasProviderAccess.mockResolvedValue(false);
    const context = makeContext(
      { userId: 'u1', role: Role.STAFF },
      { providerId: 'p1' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws BadRequestException when providerId is missing from params and body', async () => {
    const context = makeContext({ userId: 'u1', role: Role.STAFF }, {}, {});

    await expect(guard.canActivate(context)).rejects.toThrow(
      BadRequestException,
    );
    expect(permissionsService.hasProviderAccess).not.toHaveBeenCalled();
  });
});
