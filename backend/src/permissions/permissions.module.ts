import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { BranchAccessGuard } from './branch-access.guard';

@Module({
  providers: [PermissionsService, BranchAccessGuard],
  exports: [PermissionsService, BranchAccessGuard],
})
export class PermissionsModule {}
