import { describe, expect, it, vi } from 'vitest';

import { pingRenderHealth, RENDER_HEALTH_URL } from './index';

describe('pingRenderHealth', () => {
  it('keeps Render awake when health succeeds', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const logger = { error: vi.fn() };

    await pingRenderHealth(fetcher, logger);

    expect(fetcher).toHaveBeenCalledWith(RENDER_HEALTH_URL);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a non-2xx response without retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const logger = { error: vi.fn() };

    await pingRenderHealth(fetcher, logger);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Sapako keepalive health check returned HTTP 503',
    );
  });

  it('logs a rejected health request without retrying', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('connection reset'));
    const logger = { error: vi.fn() };

    await pingRenderHealth(fetcher, logger);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Sapako keepalive health check failed: connection reset',
    );
  });
});
