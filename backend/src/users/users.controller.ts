import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from './role.enum';
import { UsersService, SafeUser } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { GrantProviderAccessDto } from './dto/grant-provider-access.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { UserProviderAccess } from '../permissions/user-provider-access.entity';
import { ProvidersService } from '../providers/providers.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly providersService: ProvidersService,
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

  @Post(':id/provider-access')
  async grantAccess(
    @Param('id') userId: string,
    @Body() dto: GrantProviderAccessDto,
  ): Promise<UserProviderAccess> {
    // Confirm both sides of the access row exist before inserting —
    // otherwise an invalid userId or providerId escapes as an unhandled
    // FK-violation 500 instead of a clean 404.
    await this.usersService.findById(userId);
    await this.providersService.findById(dto.providerId);
    return this.permissionsService.grant(userId, dto.providerId);
  }

  @Delete(':id/provider-access/:providerId')
  revokeAccess(
    @Param('id') userId: string,
    @Param('providerId') providerId: string,
  ): Promise<void> {
    return this.permissionsService.revoke(userId, providerId);
  }
}
