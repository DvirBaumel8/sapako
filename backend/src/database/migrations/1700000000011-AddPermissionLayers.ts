import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPermissionLayers1700000000011 implements MigrationInterface {
  name = 'AddPermissionLayers1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // No existing data is rewritten: rows in user_provider_access are direct
    // grants and keep exactly the meaning they already had, so every user's
    // access is unchanged the moment this ships.
    await queryRunner.query(`
      CREATE TABLE user_department_access (
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "departmentId" UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        PRIMARY KEY ("userId", "departmentId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE user_provider_block (
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        PRIMARY KEY ("userId", "providerId")
      )
    `);
    // Resolution reads every rule for one user on each request.
    await queryRunner.query(
      `CREATE INDEX idx_user_department_access_user ON user_department_access("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_user_provider_block_user ON user_provider_block("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE user_provider_block`);
    await queryRunner.query(`DROP TABLE user_department_access`);
  }
}
