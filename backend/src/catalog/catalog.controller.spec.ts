import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CatalogController } from './catalog.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('CatalogController', () => {
  let controller: CatalogController;
  const mockCatalogService = {
    lookup: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CatalogController(mockCatalogService as any);
  });

  it('requires an authenticated user', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CatalogController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('returns only the fields a prefill needs', async () => {
    mockCatalogService.lookup.mockResolvedValue({
      gtin: '07290000060071',
      name: 'אטריות דקות 400 גרם',
      brand: 'אסם',
      unitType: 'גרם',
      source: 'shufersal',
      updatedAt: new Date(),
    });

    await expect(controller.lookup('7290000060071')).resolves.toEqual({
      item: { name: 'אטריות דקות 400 גרם', brand: 'אסם', unitType: 'גרם' },
    });
  });

  it('answers 200 with a null item when the barcode is unknown', async () => {
    // Not a 404: about seven scans in ten miss, and a miss is an ordinary
    // answer rather than an error worth throwing at the client or the logs.
    mockCatalogService.lookup.mockResolvedValue(null);

    await expect(controller.lookup('7290000060071')).resolves.toEqual({
      item: null,
    });
  });
});
