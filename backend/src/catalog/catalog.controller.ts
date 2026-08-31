import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CatalogService } from './catalog.service';

/** The shape the client prefills from — deliberately not the whole row. */
interface CatalogLookupResult {
  item: { name: string; brand?: string; unitType?: string } | null;
}

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  /**
   * Answers 200 with a null item rather than 404 when nothing matches.
   *
   * Measured against the live product catalogue, roughly seven scans in ten
   * find nothing. That is the ordinary case, not an error: a 404 would make
   * the client handle a thrown request on the common path and would fill the
   * logs with failures that mean "this product is not in the supermarket".
   */
  @Get('lookup/:barcode')
  async lookup(
    @Param('barcode') barcode: string,
  ): Promise<CatalogLookupResult> {
    const found = await this.catalogService.lookup(barcode);
    if (!found) return { item: null };
    return {
      item: { name: found.name, brand: found.brand, unitType: found.unitType },
    };
  }
}
