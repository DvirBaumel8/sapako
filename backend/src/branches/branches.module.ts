import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from './branch.entity';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Branch]), PermissionsModule],
  providers: [BranchesService],
  controllers: [BranchesController],
  exports: [BranchesService, TypeOrmModule],
})
export class BranchesModule {}
