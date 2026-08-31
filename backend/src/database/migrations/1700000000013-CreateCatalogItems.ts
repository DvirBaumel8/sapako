import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogItems1700000000013 implements MigrationInterface {
  name = 'CreateCatalogItems1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Reference data about products in general, not the shop's own catalogue:
    // no branch, no provider, nothing orderable. It exists so a scan of a
    // barcode nobody has entered yet can still offer a name to confirm.
    //
    // The primary key is the GTIN padded to 14 digits, which is what makes a
    // GTIN-8, a UPC-A and an EAN-13 of one product a single row. It is also
    // why there is no separate id: the barcode is the identity.
    await queryRunner.query(`
      CREATE TABLE catalog_items (
        gtin VARCHAR(14) PRIMARY KEY,
        name VARCHAR NOT NULL,
        brand VARCHAR,
        "unitType" VARCHAR,
        source VARCHAR NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE catalog_items`);
  }
}
