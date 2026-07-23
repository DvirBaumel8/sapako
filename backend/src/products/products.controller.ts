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
import { ProviderAccessGuard } from '../permissions/provider-access.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';

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
