import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../users/role.enum';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Department } from './department.entity';

@Controller('branches/:branchId/departments')
@UseGuards(JwtAuthGuard, BranchAccessGuard, RolesGuard)
export class BranchDepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  findForBranch(@Param('branchId') branchId: string): Promise<Department[]> {
    return this.departmentsService.findAllForBranch(branchId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Param('branchId') branchId: string,
    @Body() dto: CreateDepartmentDto,
  ): Promise<Department> {
    return this.departmentsService.create(branchId, dto);
  }
}

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentAdminController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<Department> {
    return this.departmentsService.update(id, dto);
  }
}
