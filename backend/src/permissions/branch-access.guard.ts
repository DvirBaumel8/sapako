import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  constructor(private readonly permissionsService: PermissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const branchId = request.params.branchId;
    const allowed = await this.permissionsService.hasBranchAccess(
      request.user,
      branchId,
    );
    if (!allowed) {
      throw new ForbiddenException('No access to this branch');
    }
    return true;
  }
}
