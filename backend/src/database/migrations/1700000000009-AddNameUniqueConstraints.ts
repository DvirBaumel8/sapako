import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNameUniqueConstraints1700000000009 implements MigrationInterface {
  name = 'AddNameUniqueConstraints1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE branches ADD CONSTRAINT "UQ_branches_name" UNIQUE (name);
      ALTER TABLE providers ADD CONSTRAINT "UQ_providers_branchId_name" UNIQUE ("branchId", name);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers DROP CONSTRAINT "UQ_providers_branchId_name";
      ALTER TABLE branches DROP CONSTRAINT "UQ_branches_name";
    `);
  }
}
