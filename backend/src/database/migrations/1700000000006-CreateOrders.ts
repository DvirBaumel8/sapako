import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1700000000006 implements MigrationInterface {
  name = 'CreateOrders1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE orders_status_enum AS ENUM ('DRAFT', 'PUBLISHED');
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        "createdByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status orders_status_enum NOT NULL DEFAULT 'DRAFT',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "publishedAt" TIMESTAMPTZ
      );
      CREATE INDEX idx_orders_branch_id ON orders("branchId");

      CREATE TABLE order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId" UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        "productId" UUID REFERENCES products(id) ON DELETE SET NULL,
        "productNameSnapshot" VARCHAR NOT NULL,
        "unitType" VARCHAR NOT NULL,
        quantity INTEGER NOT NULL
      );
      CREATE INDEX idx_order_items_order_id ON order_items("orderId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE order_items;
      DROP TABLE orders;
      DROP TYPE orders_status_enum;
    `);
  }
}
