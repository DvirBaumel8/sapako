import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from './role.enum';
import { UsersService, SafeUser } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SetAccessDto } from './dto/set-access.dto';
import { PermissionsService } from '../permissions/permissions.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findAll(): Promise<SafeUser[]> {
    const users = await this.usersService.findAllWithAccess();
    return users.map((user) => this.usersService.toSafeUser(user));
  }

  @Post()
  async create(@Body() dto: CreateUserDto): Promise<SafeUser> {
    const user = await this.usersService.create(dto);
    return this.usersService.toSafeUser(user);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }

  @Get(':id/access')
  getAccess(@Param('id') userId: string, @Query('branchId') branchId: string) {
    return this.permissionsService.getAccessForBranch(userId, branchId);
  }

  @Put(':id/providers/:providerId/access')
  setProviderAccess(
    @Param('id') userId: string,
    @Param('providerId') providerId: string,
    @Body() dto: SetAccessDto,
  ) {
    return this.permissionsService.setProviderAccess(userId, providerId, dto.granted);
  }

  @Put(':id/departments/:departmentId/access')
  setDepartmentAccess(
    @Param('id') userId: string,
    @Param('departmentId') departmentId: string,
    @Body() dto: SetAccessDto,
  ) {
    return this.permissionsService.setDepartmentAccess(userId, departmentId, dto.granted);
  }

  @Put(':id/branches/:branchId/access')
  setBranchAccess(
    @Param('id') userId: string,
    @Param('branchId') branchId: string,
    @Body() dto: SetAccessDto,
  ) {
    return this.permissionsService.setBranchAccess(userId, branchId, dto.granted);
  }
}
