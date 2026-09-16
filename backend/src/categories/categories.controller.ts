import {
  Body,
  Controller,
  Delete,
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
import { ProviderAccessGuard } from '../permissions/provider-access.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './category.entity';

@Controller('providers/:providerId/categories')
@UseGuards(JwtAuthGuard, ProviderAccessGuard, RolesGuard)
export class ProviderCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findForProvider(@Param('providerId') providerId: string): Promise<Category[]> {
    return this.categoriesService.findAllForProvider(providerId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Param('providerId') providerId: string,
    @Body() dto: CreateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.create(providerId, dto);
  }
}

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryAdminController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
