import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseSsl } from './database/ssl';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { ProvidersModule } from './providers/providers.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { DepartmentsModule } from './departments/departments.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: buildDatabaseSsl(process.env),
      autoLoadEntities: true,
      synchronize: false,
    }),
    UsersModule,
    AuthModule,
    BranchesModule,
    ProvidersModule,
    PermissionsModule,
    ProductsModule,
    OrdersModule,
    DepartmentsModule,
    CatalogModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
