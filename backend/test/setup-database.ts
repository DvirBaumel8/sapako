import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source';

/**
 * The API tests run against a real Postgres database, not mocked
 * repositories — a mocked repository test would only assert that the mocks
 * behave like the mocks. This creates a database the tests may destroy.
 *
 * DATABASE_URL is redirected before anything imports the app, because the
 * data source reads process.env at module-evaluation time.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/sapako_e2e`;

export async function createTestDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  await admin.initialize();
  // Dropped and recreated rather than truncated: a schema change between runs
  // would otherwise leave a stale database that fails in confusing ways.
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  await admin.destroy();

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await dataSource.setOptions({ url: TEST_DATABASE_URL }).initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

export async function dropTestDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  await admin.initialize();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.destroy();
}
