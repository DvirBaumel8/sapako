import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './category.entity';
import { CategoriesService } from './categories.service';
import {
  ProviderCategoriesController,
  CategoryAdminController,
} from './categories.controller';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category]),
    PermissionsModule,
    ProvidersModule,
  ],
  providers: [CategoriesService],
  controllers: [ProviderCategoriesController, CategoryAdminController],
  exports: [CategoriesService, TypeOrmModule],
})
export class CategoriesModule {}
