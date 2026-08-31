import { createTestDatabase } from './setup-database';

export default async function globalSetup(): Promise<void> {
  // The first admin is created by AdminBootstrapService on boot, not by a
  // fixture — this must be set before any app instance is created in a
  // test worker, and a freshly migrated database always has an empty users
  // table, which is exactly the condition that service checks for.
  process.env.BOOTSTRAP_ADMIN_USERNAME = 'e2e-admin';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'e2e-admin-pass';
  await createTestDatabase();
}
