import { defineWorkersConfig } from '@cloudflare/vitest-plugin/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: { wrangler: { configPath: './wrangler.jsonc' } },
    },
  },
});
