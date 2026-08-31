import { ValidationPipeOptions } from '@nestjs/common';

/**
 * The options for the global ValidationPipe.
 *
 * Extracted so main.ts and the e2e test harness configure the pipe from one
 * definition rather than two copies that agree by convention. They were
 * copies, which made the validation e2e tests weaker than they looked: they
 * exercised the harness's own pipe, so removing validation from main.ts
 * would have left production unvalidated with every test still green.
 *
 * Same reasoning as buildCorsConfig in cors.ts.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  // Drop properties no DTO declares...
  whitelist: true,
  // ...and refuse the request outright rather than silently ignoring them,
  // so a misspelled field is a visible 400 instead of a value that never
  // arrives.
  forbidNonWhitelisted: true,
  // Apply the DTO's declared types, so a route typed as number receives one.
  transform: true,
};
