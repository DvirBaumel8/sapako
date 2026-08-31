import { dropTestDatabase } from './setup-database';

export default async function globalTeardown(): Promise<void> {
  await dropTestDatabase();
}
