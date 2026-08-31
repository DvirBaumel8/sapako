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
import { buildCorsConfig, isAllowedOrigin } from './cors';
import { VALIDATION_PIPE_OPTIONS } from './validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  const corsConfig = buildCorsConfig(process.env);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isAllowedOrigin(origin, corsConfig));
    },
  });
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}
bootstrap();
