import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategories1700000000016 implements MigrationInterface {
  name = 'CreateCategories1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Categories are per-provider, not a shared branch-wide taxonomy like
    // departments — the same word ("ירקות") can mean something different
    // for two different suppliers, so there is no value in sharing rows
    // across providers the way department grants do.
    await queryRunner.query(`
      CREATE TABLE categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("providerId", name)
      );
      CREATE INDEX idx_categories_provider_id ON categories("providerId");
    `);

    // Nullable and SET NULL on delete: an uncategorized product is a normal,
    // expected state (every existing product starts this way), not an
    // error, and deleting a category un-sorts its products rather than
    // deleting them.
    await queryRunner.query(`
      ALTER TABLE products ADD COLUMN "categoryId" UUID REFERENCES categories(id) ON DELETE SET NULL;
      CREATE INDEX idx_products_category_id ON products("categoryId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products DROP COLUMN "categoryId";
      DROP TABLE categories;
    `);
  }
}
