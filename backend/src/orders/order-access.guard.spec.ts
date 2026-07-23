import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderAccessGuard } from './order-access.guard';
import { Role } from '../users/role.enum';

function makeContext(
  user: any,
  params: any,
): { context: ExecutionContext; request: any } {
  const request: any = { user, params };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('OrderAccessGuard', () => {
  const orderRepo = { findOneBy: jest.fn() };
  const permissionsService = { hasProviderAccess: jest.fn() };
  const guard = new OrderAccessGuard(
    orderRepo as any,
    permissionsService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFoundException when the order does not exist', async () => {
    orderRepo.findOneBy.mockResolvedValue(null);
    const { context } = makeContext(
      { userId: 'u1', role: Role.STAFF },
      { id: 'missing' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    expect(permissionsService.hasProviderAccess).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user lacks access to the order provider', async () => {
    orderRepo.findOneBy.mockResolvedValue({ id: 'o1', providerId: 'p1' });
    permissionsService.hasProviderAccess.mockResolvedValue(false);
    const { context } = makeContext(
      { userId: 'u1', role: Role.STAFF },
      { id: 'o1' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(permissionsService.hasProviderAccess).toHaveBeenCalledWith(
      { userId: 'u1', role: Role.STAFF },
      'p1',
    );
  });

  it('allows the request and attaches the order to the request when access is granted', async () => {
    const order = { id: 'o1', providerId: 'p1' };
    orderRepo.findOneBy.mockResolvedValue(order);
    permissionsService.hasProviderAccess.mockResolvedValue(true);
    const { context, request } = makeContext(
      { userId: 'u1', role: Role.STAFF },
      { id: 'o1' },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.order).toBe(order);
  });
});
