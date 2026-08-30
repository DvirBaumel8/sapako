export interface CorsConfig {
  allowlist: string[];
  previewPattern: RegExp;
}

export function isAllowedOrigin(
  origin: string | undefined,
  config: CorsConfig,
): boolean {
  // Non-browser callers (curl, health checks, server-to-server) send no
  // Origin header at all. CORS is a browser mechanism; blocking these would
  // break the Railway health check for no security benefit.
  if (!origin) {
    return true;
  }
  if (config.allowlist.includes(origin)) {
    return true;
  }
  return config.previewPattern.test(origin);
}

export function buildCorsConfig(env: NodeJS.ProcessEnv): CorsConfig {
  const allowlist = (env.WEB_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const project = env.PAGES_PROJECT ?? 'sapako';
  return {
    allowlist,
    // Anchored at both ends so that "sapako.pages.dev.evil.com" cannot match.
    previewPattern: new RegExp(
      `^https://[a-z0-9-]+\\.${project}\\.pages\\.dev$`,
    ),
  };
}
