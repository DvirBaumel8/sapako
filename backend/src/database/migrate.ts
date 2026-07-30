// Runs migrations via the DataSource API directly instead of TypeORM's CLI
// (`typeorm migration:run`) — that CLI requires() yargs, and yargs ships as
// pure ESM (.mjs) in the version TypeORM pulls in, which Node's CJS/ESM
// interop refuses to require() regardless of Node version. This has no such
// dependency.
import dataSource from './data-source';

dataSource
  .initialize()
  .then(() => dataSource.runMigrations())
  .then(() => dataSource.destroy())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
