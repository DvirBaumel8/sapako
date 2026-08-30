import { isAllowedOrigin } from './cors';

describe('isAllowedOrigin', () => {
  const config = {
    allowlist: ['https://sapako.pages.dev'],
    previewPattern: /^https:\/\/[a-z0-9-]+\.sapako\.pages\.dev$/,
  };

  it('allows the production origin', () => {
    expect(isAllowedOrigin('https://sapako.pages.dev', config)).toBe(true);
  });

  it('allows a preview deployment origin', () => {
    expect(
      isAllowedOrigin('https://pwa-web-app.sapako.pages.dev', config),
    ).toBe(true);
  });

  it('rejects an unrelated origin', () => {
    expect(isAllowedOrigin('https://evil.example.com', config)).toBe(false);
  });

  it('rejects an origin that merely ends with the preview domain', () => {
    expect(isAllowedOrigin('https://sapako.pages.dev.evil.com', config)).toBe(
      false,
    );
  });

  it('allows requests with no Origin header', () => {
    // curl, server-to-server calls, and Railway's health checks send no
    // Origin. These are not browser requests, so CORS does not apply.
    expect(isAllowedOrigin(undefined, config)).toBe(true);
  });
});
