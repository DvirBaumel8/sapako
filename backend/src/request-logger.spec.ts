import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { formatRequestLog, requestLogger, shouldLogPath } from './request-logger';

describe('shouldLogPath', () => {
  it('skips the health check endpoint, which is polled every few seconds', () => {
    expect(shouldLogPath('/health')).toBe(false);
  });

  it('logs every other path', () => {
    expect(shouldLogPath('/auth/login')).toBe(true);
    expect(shouldLogPath('/branches/b1/products')).toBe(true);
  });
});

describe('formatRequestLog', () => {
  it('formats method, path, status and duration on one line', () => {
    expect(
      formatRequestLog({
        method: 'GET',
        path: '/branches',
        statusCode: 200,
        durationMs: 42,
      }),
    ).toBe('GET /branches 200 42ms');
  });
});

describe('requestLogger', () => {
  function createRes() {
    const res = new EventEmitter() as unknown as { statusCode: number } & EventEmitter;
    res.statusCode = 200;
    return res;
  }

  it('calls next immediately, then logs once the response finishes with its final status', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const req = { method: 'POST', path: '/orders' } as any;
    const res = createRes();
    const next = jest.fn();

    requestLogger(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    // Not known until the handler actually responds.
    res.statusCode = 201;
    res.emit('finish');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^POST \/orders 201 \d+ms$/),
    );
    logSpy.mockRestore();
  });

  it('still calls next for a skipped path, but never logs it', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const req = { method: 'GET', path: '/health' } as any;
    const res = createRes();
    const next = jest.fn();

    requestLogger(req, res as any, next);
    res.emit('finish');

    expect(next).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
