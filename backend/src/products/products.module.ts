import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductsService } from './products.service';
import {
  BranchProductsController,
  ProviderProductsController,
  ProductAdminController,
} from './products.controller';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    PermissionsModule,
    ProvidersModule,
  ],
  providers: [ProductsService],
  controllers: [
    BranchProductsController,
    ProviderProductsController,
    ProductAdminController,
  ],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
