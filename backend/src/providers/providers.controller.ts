import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../users/role.enum';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { Provider } from './provider.entity';

@Controller('branches/:branchId/providers')
@UseGuards(JwtAuthGuard, BranchAccessGuard, RolesGuard)
export class BranchProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  findForBranch(@Param('branchId') branchId: string): Promise<Provider[]> {
    return this.providersService.findActiveByBranch(branchId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Param('branchId') branchId: string,
    @Body() dto: CreateProviderDto,
  ): Promise<Provider> {
    return this.providersService.create(branchId, dto);
  }
}

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderAdminController {
  constructor(private readonly providersService: ProvidersService) {}

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<Provider> {
    return this.providersService.update(id, dto);
  }
}
