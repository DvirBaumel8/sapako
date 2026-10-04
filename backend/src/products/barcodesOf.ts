import { Product } from './product.entity';

/** Every barcode a product answers to: the main one first, then the rest. */
export function barcodesOf(
  product: Pick<Product, 'barcode' | 'additionalBarcodes'>,
): string[] {
  return [product.barcode, ...(product.additionalBarcodes ?? [])].filter(
    (code): code is string => !!code,
  );
}
