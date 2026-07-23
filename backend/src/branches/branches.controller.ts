import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../users/role.enum';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { Branch } from './branch.entity';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findAccessible(@Req() req: any): Promise<Branch[]> {
    const accessibleBranchIds =
      await this.permissionsService.getAccessibleBranchIds(req.user);
    if (accessibleBranchIds === 'ALL') {
      return this.branchesService.findAll();
    }
    return this.branchesService.findByIds(accessibleBranchIds);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateBranchDto): Promise<Branch> {
    return this.branchesService.create(dto);
  }
}
