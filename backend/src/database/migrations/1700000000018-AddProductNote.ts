import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductNote1700000000018 implements MigrationInterface {
  name = 'AddProductNote1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable with no backfill: "no note" is the normal state for every
    // existing product. The length cap mirrors the DTO so a write that
    // bypassed validation still could not store more.
    await queryRunner.query(
      `ALTER TABLE products ADD COLUMN note VARCHAR(200) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE products DROP COLUMN note`);
  }
}
