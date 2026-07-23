import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProviders1700000000003 implements MigrationInterface {
  name = 'CreateProviders1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE providers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        phone VARCHAR NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_providers_branch_id ON providers("branchId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE providers;`);
  }
}
