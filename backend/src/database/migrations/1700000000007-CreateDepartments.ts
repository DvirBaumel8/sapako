import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDepartments1700000000007 implements MigrationInterface {
  name = 'CreateDepartments1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("branchId", name)
      );
      CREATE INDEX idx_departments_branch_id ON departments("branchId");

      INSERT INTO departments ("branchId", name)
      SELECT b.id, d.name
      FROM branches b
      CROSS JOIN (VALUES
        ('יין/אלכוהול'),
        ('חומרי ניקוי'),
        ('פיצוחים'),
        ('מוצרי חלב'),
        ('קפואים'),
        ('כללי')
      ) AS d(name);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE departments;
    `);
  }
}
