import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity';
import { DepartmentsService } from './departments.service';
import {
  BranchDepartmentsController,
  DepartmentAdminController,
} from './departments.controller';
import { PermissionsModule } from '../permissions/permissions.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Department]),
    PermissionsModule,
    BranchesModule,
  ],
  providers: [DepartmentsService],
  controllers: [BranchDepartmentsController, DepartmentAdminController],
  exports: [DepartmentsService, TypeOrmModule],
})
export class DepartmentsModule {}
