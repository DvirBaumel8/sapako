import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranches1700000000002 implements MigrationInterface {
  name = 'CreateBranches1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL,
        address VARCHAR,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE branches;`);
  }
}
