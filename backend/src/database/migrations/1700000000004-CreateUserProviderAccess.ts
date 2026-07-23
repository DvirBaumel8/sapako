import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserProviderAccess1700000000004
  implements MigrationInterface
{
  name = 'CreateUserProviderAccess1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_provider_access (
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        PRIMARY KEY ("userId", "providerId")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE user_provider_access;`);
  }
}
