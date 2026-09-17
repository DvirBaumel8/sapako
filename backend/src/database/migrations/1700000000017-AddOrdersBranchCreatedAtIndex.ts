import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * findByBranch (the "recent activity" list) filters by branchId and orders
 * by createdAt DESC with a LIMIT — the single-column branchId index from
 * CreateOrders could find the right rows but still had to sort all of them
 * to apply that limit. A branch with years of order history was doing that
 * sort on every visit to a screen that only ever shows the newest 200.
 *
 * This composite index matches the query exactly (equality column first,
 * then the sort column, in the same direction), so Postgres can walk it in
 * order and stop at the limit instead of sorting. It also serves every
 * plain branchId lookup the old index did, via the leftmost-prefix rule —
 * nothing needs both.
 */
export class AddOrdersBranchCreatedAtIndex1700000000017
  implements MigrationInterface
{
  name = 'AddOrdersBranchCreatedAtIndex1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_orders_branch_id;
      CREATE INDEX idx_orders_branch_id_created_at ON orders("branchId", "createdAt" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_orders_branch_id_created_at;
      CREATE INDEX idx_orders_branch_id ON orders("branchId");
    `);
  }
}
