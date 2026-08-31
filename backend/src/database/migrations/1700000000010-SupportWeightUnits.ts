import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportWeightUnits1700000000010 implements MigrationInterface {
  name = 'SupportWeightUnits1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Every product was imported with the placeholder "יח'". The catalogue is
    // ordered by the carton, so that becomes the default; the handful sold by
    // weight are changed individually afterwards.
    await queryRunner.query(`UPDATE products SET "unitType" = 'קרטון'`);

    // Weight is fractional: 2.5 kg of cheese is a normal order. Two decimal
    // places is more than the half-kilo steps need and leaves room for a
    // typed-in 1.25.
    await queryRunner.query(
      `ALTER TABLE order_items ALTER COLUMN quantity TYPE NUMERIC(10,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rounds rather than truncates, so 2.5 becomes 3 and not 2 — reverting
    // must not quietly shrink an order that was already placed.
    await queryRunner.query(
      `ALTER TABLE order_items ALTER COLUMN quantity TYPE INTEGER USING ROUND(quantity)`,
    );
    await queryRunner.query(`UPDATE products SET "unitType" = 'יח''' `);
  }
}
