import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
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
import { AdminNotificationsModule } from './admin-notifications/admin-notifications.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [
    // Must be registered first, per @sentry/nestjs's setup docs.
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        // A generous app-wide default, meant to blunt scripted abuse rather
        // than shape real usage — individual routes (e.g. login) tighten
        // this with their own @Throttle(). A single admin building out an
        // order line-by-line, or bulk-adding products, can easily fire a few
        // hundred requests in a burst; the e2e suite's
        // RECENT_ORDER_LIMIT-cap test does exactly that and set the floor
        // for this number.
        ttl: 60_000,
        limit: 1000,
      },
    ]),
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
    AdminNotificationsModule,
    CategoriesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Reports unhandled exceptions to Sentry (a no-op until SENTRY_DSN is
    // set, see src/instrument.ts) without replacing NestJS's own
    // exception-to-HTTP-response handling — it delegates to that after
    // reporting. Must come before any other exception filter.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
