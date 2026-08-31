import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A product as some external catalogue describes it, keyed by barcode.
 *
 * This is reference data, not the shop's own catalogue: nothing here belongs
 * to a provider or a branch, and nothing here is ordered. It exists so that
 * scanning a barcode nobody has entered yet can still offer a name to confirm,
 * instead of an empty text field.
 *
 * Rows are replaced wholesale by the ingest script, so anything a person edits
 * here is lost on the next run — corrections belong on the product.
 */
@Entity('catalog_items')
export class CatalogItem {
  /**
   * The GTIN padded to 14 digits — `gtinMatchKey`, never the raw scan. Fixing
   * the width is what lets a GTIN-8, a UPC-A and an EAN-13 for one product
   * resolve to a single row.
   */
  @PrimaryColumn()
  gtin: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  brand?: string;

  /**
   * Already mapped onto UNIT_TYPES at ingest time, or null when the source
   * reported a unit this app does not offer. Never the source's own spelling.
   */
  @Column({ nullable: true })
  unitType?: string;

  /** Which feed this row came from, so a bad source can be identified later. */
  @Column()
  source: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
