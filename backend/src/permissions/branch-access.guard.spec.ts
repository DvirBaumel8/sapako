import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BranchAccessGuard } from './branch-access.guard';
import { PermissionsService } from './permissions.service';
import { Role } from '../users/role.enum';

describe('BranchAccessGuard', () => {
  let guard: BranchAccessGuard;
  const permissionsService = {
    hasBranchAccess: jest.fn(),
  } as unknown as PermissionsService;

  const buildContext = (
    params: { branchId?: string },
    user?: { role: Role },
  ): ExecutionContext => {
    const getRequest = jest.fn(() => ({ params, user }));
    const switchToHttp = jest.fn(() => ({ getRequest }));
    return { switchToHttp } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new BranchAccessGuard(permissionsService);
  });

  it('allows the request when the user has access to the branch', async () => {
    (permissionsService.hasBranchAccess as jest.Mock).mockResolvedValue(true);
    const context = buildContext({ branchId: 'b1' }, { role: Role.ADMIN });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(permissionsService.hasBranchAccess).toHaveBeenCalledWith(
      { role: Role.ADMIN },
      'b1',
    );
  });

  it('throws ForbiddenException when the user does not have access to the branch', async () => {
    (permissionsService.hasBranchAccess as jest.Mock).mockResolvedValue(false);
    const context = buildContext({ branchId: 'b1' }, { role: Role.STAFF });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
