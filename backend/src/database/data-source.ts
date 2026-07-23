import 'dotenv/config';
import { DataSource } from 'typeorm';

// NOTE: the installed TypeORM CLI rejects a module that exports the same
// DataSource instance under more than one export name (it iterates every
// export looking for a DataSource and errors if it finds duplicates), so
// this must have exactly one export.
const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});

export default dataSource;
