import type { Product } from '../api/types';
import { matchesBarcode } from './matchesBarcode';

type WithBarcodes = Pick<Product, 'barcode' | 'additionalBarcodes'>;

/** Every barcode a product answers to: the main one first, then the rest. */
export function productBarcodes(product: WithBarcodes): string[] {
  return [product.barcode, ...(product.additionalBarcodes ?? [])].filter(
    (code): code is string => !!code,
  );
}

export function productMatchesBarcode(product: WithBarcodes, scanned: string): boolean {
  return productBarcodes(product).some((stored) => matchesBarcode(stored, scanned));
}
