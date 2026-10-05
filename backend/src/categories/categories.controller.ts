import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ProviderAccessGuard } from '../permissions/provider-access.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './category.entity';

@Controller('providers/:providerId/categories')
@UseGuards(JwtAuthGuard, ProviderAccessGuard, RolesGuard)
export class ProviderCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  findForProvider(
    @Param('providerId') providerId: string,
  ): Promise<Category[]> {
    return this.categoriesService.findAllForProvider(providerId);
  }

  // Admins, or staff with the can-edit-products flag and access to this
  // provider. An explicit call rather than @Roles because the flag is a
  // per-user DB value, not a role.
  @Post()
  async create(
    @Req() req: { user: AuthenticatedUser },
    @Param('providerId') providerId: string,
    @Body() dto: CreateCategoryDto,
  ): Promise<Category> {
    await this.permissionsService.assertCanEditProducts(req.user, providerId);
    return this.categoriesService.create(providerId, dto);
  }
}

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryAdminController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // Admins, or staff with the can-edit-products flag and access to the
  // category's provider. The provider comes from the category row, so this
  // is an explicit call rather than @Roles (the flag is a per-user DB value).
  @Patch(':id')
  async update(
    @Req() req: { user: AuthenticatedUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.categoriesService.findById(id);
    await this.permissionsService.assertCanEditProducts(
      req.user,
      category.providerId,
    );
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: AuthenticatedUser },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const category = await this.categoriesService.findById(id);
    await this.permissionsService.assertCanEditProducts(
      req.user,
      category.providerId,
    );
    return this.categoriesService.remove(id);
  }
}
