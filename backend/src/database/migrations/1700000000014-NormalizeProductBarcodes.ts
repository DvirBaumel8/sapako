import { MigrationInterface, QueryRunner } from 'typeorm';
import { planBarcodeRepairs } from '../../products/barcodeRepair';

export class NormalizeProductBarcodes1700000000014 implements MigrationInterface {
  name = 'NormalizeProductBarcodes1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rewrites the barcodes that are a valid GTIN wearing the wrong clothes:
    // a UPC-A whose leading zero a spreadsheet import ate, or a code a scanner
    // handed over with its "]C1" symbology prefix still attached. Both are
    // invisible to an equality match, so those products cannot be found by
    // scanning them.
    //
    // Anything that is not recoverable is left alone — see planBarcodeRepairs.
    const rows: { id: string; barcode: string | null }[] =
      await queryRunner.query(
        `SELECT id, barcode FROM products WHERE barcode IS NOT NULL`,
      );

    const repairs = planBarcodeRepairs(rows);

    // One statement per row rather than a single CASE: this runs once, over a
    // five-figure table, and a readable loop is worth more here than the
    // round trips it costs.
    for (const repair of repairs) {
      await queryRunner.query(
        `UPDATE products SET barcode = $1 WHERE id = $2`,
        [repair.to, repair.id],
      );
    }

    console.log(`normalised ${repairs.length} product barcodes`);
  }

  public async down(): Promise<void> {
    // Deliberately does nothing. The original values were malformed and are
    // not recorded anywhere, so there is nothing to restore them from; and
    // re-breaking a barcode that now matches would serve nobody. Reverting
    // this migration leaves the corrected values in place.
  }
}
