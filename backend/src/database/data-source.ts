import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDatabaseSsl } from './ssl';
import { EnableUuidExtension1700000000000 } from './migrations/1700000000000-EnableUuidExtension';
import { CreateUsers1700000000001 } from './migrations/1700000000001-CreateUsers';
import { CreateBranches1700000000002 } from './migrations/1700000000002-CreateBranches';
import { CreateProviders1700000000003 } from './migrations/1700000000003-CreateProviders';
import { CreateUserProviderAccess1700000000004 } from './migrations/1700000000004-CreateUserProviderAccess';
import { CreateProducts1700000000005 } from './migrations/1700000000005-CreateProducts';
import { CreateOrders1700000000006 } from './migrations/1700000000006-CreateOrders';
import { CreateDepartments1700000000007 } from './migrations/1700000000007-CreateDepartments';
import { CreateProviderDepartments1700000000008 } from './migrations/1700000000008-CreateProviderDepartments';
import { AddNameUniqueConstraints1700000000009 } from './migrations/1700000000009-AddNameUniqueConstraints';
import { SupportWeightUnits1700000000010 } from './migrations/1700000000010-SupportWeightUnits';
import { AddPermissionLayers1700000000011 } from './migrations/1700000000011-AddPermissionLayers';

// NOTE: the installed TypeORM CLI rejects a module that exports the same
// DataSource instance under more than one export name (it iterates every
// export looking for a DataSource and errors if it finds duplicates), so
// this must have exactly one export.
//
// Migrations are imported explicitly rather than via a glob string
// (`migrations/*.{ts,js}`) — the glob form silently matched zero files
// under some ts-node/dist execution contexts, which made runMigrations()
// report success while doing nothing.
const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: buildDatabaseSsl(process.env),
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [
    EnableUuidExtension1700000000000,
    CreateUsers1700000000001,
    CreateBranches1700000000002,
    CreateProviders1700000000003,
    CreateUserProviderAccess1700000000004,
    CreateProducts1700000000005,
    CreateOrders1700000000006,
    CreateDepartments1700000000007,
    CreateProviderDepartments1700000000008,
    AddNameUniqueConstraints1700000000009,
    SupportWeightUnits1700000000010,
    AddPermissionLayers1700000000011,
  ],
  synchronize: false,
});

export default dataSource;
