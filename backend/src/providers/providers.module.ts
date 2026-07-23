import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from './provider.entity';
import { ProvidersService } from './providers.service';
import {
  BranchProvidersController,
  ProviderAdminController,
} from './providers.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Provider]), PermissionsModule],
  providers: [ProvidersService],
  controllers: [BranchProvidersController, ProviderAdminController],
  exports: [ProvidersService, TypeOrmModule],
})
export class ProvidersModule {}
