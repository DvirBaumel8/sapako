import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogItem } from './catalog-item.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogItem])],
  providers: [CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
