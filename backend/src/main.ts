// Must be the first import: several modules read process.env at
// decorator-evaluation time (e.g. AuthModule's JwtModule.register), which
// happens while this file's later imports are being required — before
// ConfigModule.forRoot() (nested inside AppModule) would otherwise load
// .env. Loading dotenv here eagerly guarantees env vars are populated
// before any of those modules are constructed. Mirrors the same fix
// already applied in src/database/data-source.ts.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}
bootstrap();
