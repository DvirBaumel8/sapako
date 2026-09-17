import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, ADMIN } from './helpers';

// Companion to authorization.e2e-spec.ts: that file proves who can reach a
// route, this proves how often. Isolated in its own app instance (rather
// than reusing seed()'s app) so tripping the login throttle here can't leak
// into any other file's login calls.
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks /auth/login after its per-minute limit, regardless of whether the credentials are right', async () => {
    const http = app.getHttpServer();
    const attempt = () =>
      request(http)
        .post('/auth/login')
        .send({ username: ADMIN.username, password: 'wrong-password' });

    // The route's own limit (see @Throttle on AuthController#login) is 10
    // per 60s — exhaust it, then one more should be rejected before the
    // handler even runs a credential check.
    for (let i = 0; i < 10; i += 1) {
      const response = await attempt();
      expect(response.status).not.toBe(429);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
  });
});
