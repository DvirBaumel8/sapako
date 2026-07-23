import { Injectable } from '@nestjs/common';
import { Role } from '../users/role.enum';
import { AuthenticatedUser } from '../auth/jwt.strategy';

@Injectable()
export class PermissionsService {
  async getAccessibleBranchIds(
    user: AuthenticatedUser,
  ): Promise<string[] | 'ALL'> {
    if (user.role === Role.ADMIN) {
      return 'ALL';
    }
    // STAFF branch-scoping is implemented in full in Task 6 (UserProviderAccess-derived).
    // Until then, STAFF users see no branches — safe default, not a silent bypass.
    return [];
  }

  async hasBranchAccess(
    user: AuthenticatedUser,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    branchId: string,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) {
      return true;
    }
    // STAFF branch access is implemented in full in Task 6 (UserProviderAccess-derived).
    // Until then, STAFF has no branch access — safe default, not a silent bypass.
    return false;
  }
}
