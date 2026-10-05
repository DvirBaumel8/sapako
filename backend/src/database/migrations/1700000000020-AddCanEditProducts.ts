import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanEditProducts1700000000020 implements MigrationInterface {
  name = 'AddCanEditProducts1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN "canEditProducts" BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN "canEditProducts"`);
  }
}
