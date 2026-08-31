import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CatalogService } from './catalog.service';
import { CatalogItem } from './catalog-item.entity';

describe('CatalogService', () => {
  let service: CatalogService;
  const mockRepo = {
    findOneBy: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: getRepositoryToken(CatalogItem), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(CatalogService);
  });

  describe('lookup', () => {
    it('finds an item by the padded match key, not the scanned string', async () => {
      // The catalogue is keyed on the 14-digit form, so a scanned EAN-13 has
      // to be padded before it can hit anything.
      mockRepo.findOneBy.mockResolvedValue({ gtin: '07290000060071' });

      await service.lookup('7290000060071');

      expect(mockRepo.findOneBy).toHaveBeenCalledWith({
        gtin: '07290000060071',
      });
    });

    it('finds the same item from a UPC-A that lost its leading zero', async () => {
      mockRepo.findOneBy.mockResolvedValue({ gtin: '00016000185517' });

      await service.lookup('16000185517');

      expect(mockRepo.findOneBy).toHaveBeenCalledWith({
        gtin: '00016000185517',
      });
    });

    it('returns the item it found', async () => {
      const item = { gtin: '07290000060071', name: 'אטריות דקות 400 גרם' };
      mockRepo.findOneBy.mockResolvedValue(item);

      await expect(service.lookup('7290000060071')).resolves.toBe(item);
    });

    it('returns null when the catalogue has no such barcode', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(service.lookup('7290000060071')).resolves.toBeNull();
    });

    it('does not query at all for something that is not a barcode', async () => {
      // Otherwise every stray value in the barcode column becomes a database
      // round trip that can only ever miss.
      await expect(service.lookup('#NAME?')).resolves.toBeNull();

      expect(mockRepo.findOneBy).not.toHaveBeenCalled();
    });
  });
});
