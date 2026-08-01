import { resolveBarcodeMatches } from './resolveBarcodeMatches';
import type { Provider, ProviderProductSummary } from '../api/types';

describe('resolveBarcodeMatches', () => {
  const providers: Provider[] = [
    {
      id: 'p1',
      branchId: 'b1',
      name: 'חברת הבשר',
      phone: '+972501234567',
      isActive: true,
      departments: [],
      createdAt: '2026-07-23T10:00:00.000Z',
    },
    {
      id: 'p2',
      branchId: 'b1',
      name: 'ירקות השדה',
      phone: '+972507654321',
      isActive: true,
      departments: [],
      createdAt: '2026-07-23T10:00:00.000Z',
    },
  ];

  it('returns an empty array when no product matches the barcode', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'p1', name: 'בשר טחון', barcode: '111' },
    ];

    expect(resolveBarcodeMatches(providers, products, '999')).toEqual([]);
  });

  it('returns a single match with the resolved provider name', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'p1', name: 'בשר טחון', barcode: '111' },
      { id: 'pr2', providerId: 'p2', name: 'עגבניות', barcode: '222' },
    ];

    expect(resolveBarcodeMatches(providers, products, '111')).toEqual([
      { providerId: 'p1', providerName: 'חברת הבשר', productId: 'pr1' },
    ]);
  });

  it('returns one match per provider when multiple providers share the same barcode', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'p1', name: 'בשר טחון', barcode: '111' },
      { id: 'pr2', providerId: 'p2', name: 'בשר טחון קפוא', barcode: '111' },
    ];

    expect(resolveBarcodeMatches(providers, products, '111')).toEqual([
      { providerId: 'p1', providerName: 'חברת הבשר', productId: 'pr1' },
      { providerId: 'p2', providerName: 'ירקות השדה', productId: 'pr2' },
    ]);
  });

  it('drops a matching product whose provider is not in the given providers list', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'missing-provider', name: 'בשר טחון', barcode: '111' },
    ];

    expect(resolveBarcodeMatches(providers, products, '111')).toEqual([]);
  });
});
