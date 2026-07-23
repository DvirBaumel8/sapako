import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';

@Injectable()
export class ProviderAccessGuard implements CanActivate {
  constructor(private readonly permissionsService: PermissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const providerId = request.params?.providerId ?? request.body?.providerId;
    if (!providerId) {
      throw new BadRequestException('providerId is required');
    }
    const allowed = await this.permissionsService.hasProviderAccess(
      request.user,
      providerId,
    );
    if (!allowed) {
      throw new ForbiddenException('No access to this provider');
    }
    return true;
  }
}
