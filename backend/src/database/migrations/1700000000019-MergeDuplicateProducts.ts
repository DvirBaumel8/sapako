import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  createNormalizedNameIndex,
  dropNormalizedNameIndex,
  mergeDuplicateProducts,
} from '../../products/mergeDuplicateProducts';

export class MergeDuplicateProducts1700000000019 implements MigrationInterface {
  name = 'MergeDuplicateProducts1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail fast and roll back rather than queue every products query behind the ALTER if an old instance holds a lock.
    await queryRunner.query(`SET LOCAL lock_timeout = '10s'`);
    await queryRunner.query(`
      ALTER TABLE products
        ADD COLUMN "additionalBarcodes" TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN "mergedIntoProductId" UUID NULL REFERENCES products(id) ON DELETE SET NULL
    `);
    // The one-off item-file import created one product per barcode; see
    // docs/superpowers/specs/2026-10-05-merge-duplicate-products-design.md.
    const summary = await mergeDuplicateProducts(queryRunner);
    console.log(
      `MergeDuplicateProducts: merged ${summary.groups} groups, hid ${summary.hidden} products, repointed ${summary.orderLinesRepointed} order lines, collapsed ${summary.draftLinesCollapsed} draft lines, ${summary.lockedOrderCollisions} sent-order lines now share a product`,
    );
    await createNormalizedNameIndex(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await dropNormalizedNameIndex(queryRunner);
    // Repointed order lines stay on the survivor: same product, and each line
    // keeps its own name snapshot.
    await queryRunner.query(`
      UPDATE products SET "isActive" = true WHERE "mergedIntoProductId" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE products DROP COLUMN "mergedIntoProductId", DROP COLUMN "additionalBarcodes"
    `);
  }
}
