import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProviderDepartments1700000000008 implements MigrationInterface {
  name = 'CreateProviderDepartments1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE provider_departments (
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        "departmentId" UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        PRIMARY KEY ("providerId", "departmentId")
      );
      CREATE INDEX idx_provider_departments_department_id ON provider_departments("departmentId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE provider_departments;
    `);
  }
}
