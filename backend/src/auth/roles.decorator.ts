import { SetMetadata } from '@nestjs/common';
import { Role } from '../users/role.enum';

export const ROLES_KEY = 'roles';

/** Calling `@Roles()` with zero arguments is a no-op (pass-through), NOT deny-all — RolesGuard treats an empty roles array the same as no metadata at all. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
