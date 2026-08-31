import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProviderAccess } from './user-provider-access.entity';
import { UserDepartmentAccess } from './user-department-access.entity';
import { UserProviderBlock } from './user-provider-block.entity';
import { Provider } from '../providers/provider.entity';
import { Department } from '../departments/department.entity';
import { PermissionsService } from './permissions.service';
import { ProviderAccessGuard } from './provider-access.guard';
import { BranchAccessGuard } from './branch-access.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserProviderAccess,
      UserDepartmentAccess,
      UserProviderBlock,
      Provider,
      Department,
    ]),
  ],
  providers: [PermissionsService, ProviderAccessGuard, BranchAccessGuard],
  exports: [PermissionsService, ProviderAccessGuard, BranchAccessGuard],
})
export class PermissionsModule {}
