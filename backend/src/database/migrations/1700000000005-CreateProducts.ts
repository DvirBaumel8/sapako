import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProducts1700000000005 implements MigrationInterface {
  name = 'CreateProducts1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        "unitType" VARCHAR NOT NULL,
        barcode VARCHAR,
        "imageUrl" VARCHAR,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_products_provider_id ON products("providerId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE products;`);
  }
}
