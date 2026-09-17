import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

// Render (and any uptime monitor) polls this every few seconds — logging it
// would drown out every real request in noise within minutes.
const UNLOGGED_PATHS = new Set(['/health']);

export function shouldLogPath(path: string): boolean {
  return !UNLOGGED_PATHS.has(path);
}

export function formatRequestLog(entry: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}): string {
  return `${entry.method} ${entry.path} ${entry.statusCode} ${entry.durationMs}ms`;
}

/**
 * One line per request once it finishes, with the fields needed to spot a
 * slow or failing endpoint from the logs alone: method, path, status, and
 * how long it took. Registered directly in main.ts, ahead of everything
 * else, so it sees every request regardless of which guard or pipe later
 * rejects it.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!shouldLogPath(req.path)) {
    next();
    return;
  }
  const start = Date.now();
  res.on('finish', () => {
    logger.log(
      formatRequestLog({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      }),
    );
  });
  next();
}
