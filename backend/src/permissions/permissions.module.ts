import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProviderAccess } from './user-provider-access.entity';
import { UserDepartmentAccess } from './user-department-access.entity';
import { UserProviderBlock } from './user-provider-block.entity';
import { PermissionsService } from './permissions.service';
import { ProviderAccessGuard } from './provider-access.guard';
import { BranchAccessGuard } from './branch-access.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserProviderAccess,
      UserDepartmentAccess,
      UserProviderBlock,
    ]),
  ],
  providers: [PermissionsService, ProviderAccessGuard, BranchAccessGuard],
  exports: [PermissionsService, ProviderAccessGuard, BranchAccessGuard],
})
export class PermissionsModule {}
