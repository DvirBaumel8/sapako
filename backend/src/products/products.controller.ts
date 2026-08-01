import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../users/role.enum';
import { ProviderAccessGuard } from '../permissions/provider-access.guard';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';

@Controller('branches/:branchId/products')
@UseGuards(JwtAuthGuard, BranchAccessGuard, RolesGuard)
export class BranchProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findForBranch(
    @Req() req: any,
    @Param('branchId') branchId: string,
  ): Promise<Product[]> {
    const accessibleProviderIds =
      await this.permissionsService.getAccessibleProviderIds(req.user);
    return this.productsService.findActiveByBranch(
      branchId,
      accessibleProviderIds,
    );
  }
}

@Controller('providers/:providerId/products')
@UseGuards(JwtAuthGuard, ProviderAccessGuard, RolesGuard)
export class ProviderProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findForProvider(@Param('providerId') providerId: string): Promise<Product[]> {
    return this.productsService.findActiveByProvider(providerId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Param('providerId') providerId: string,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.productsService.create(providerId, dto);
  }
}

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductAdminController {
  constructor(private readonly productsService: ProductsService) {}

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, dto);
  }
}
