import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogItem } from './catalog-item.entity';
import { gtinMatchKey } from '../products/gtin';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(CatalogItem)
    private readonly catalogRepo: Repository<CatalogItem>,
  ) {}

  /**
   * Looks a barcode up in the reference catalogue.
   *
   * Null covers both "not a barcode" and "not in the catalogue" — the caller
   * treats them identically, since neither can offer a name to prefill.
   */
  async lookup(barcode: string): Promise<CatalogItem | null> {
    const gtin = gtinMatchKey(barcode);
    if (gtin === null) return null;
    return this.catalogRepo.findOneBy({ gtin });
  }
}
