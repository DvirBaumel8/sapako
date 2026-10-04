import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Not, Raw, Repository } from 'typeorm';
import { Product } from './product.entity';
import { Provider } from '../providers/provider.entity';
import { ProvidersService } from '../providers/providers.service';
import { CategoriesService } from '../categories/categories.service';
import { gtinMatchKey } from './gtin';
import { isUniqueViolation } from '../database/uniqueViolation';
import { barcodesOf } from './barcodesOf';

// A hard ceiling purely as a safety net against an unbounded query, not a
// real pagination scheme — not expected to bind at today's catalogue size
// (~14K products branch-wide). If this ever trips, that is a signal to build
// real server-side search rather than raise the number further.
const MAX_PRODUCTS_PER_QUERY = 20000;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly providersService: ProvidersService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /** A category only makes sense for the product's own provider. */
  private async assertCategoryBelongsToProvider(
    categoryId: string,
    providerId: string,
  ): Promise<void> {
    const category = await this.categoriesService.findById(categoryId);
    if (category.providerId !== providerId) {
      throw new BadRequestException(
        'Category does not belong to this product’s provider',
      );
    }
  }

  async create(
    providerId: string,
    input: {
      name: string;
      unitType: string;
      barcode?: string;
      categoryId?: string;
    },
  ): Promise<Product> {
    // Confirm the provider exists before inserting — otherwise an invalid
    // providerId escapes as an unhandled FK-violation 500 instead of a
    // clean 404 (same failure mode already fixed for grantAccess).
    await this.providersService.findById(providerId);
    if (input.categoryId) {
      await this.assertCategoryBelongsToProvider(input.categoryId, providerId);
    }
    const entity = this.productsRepo.create({ providerId, ...input });
    return this.saveRefusingDuplicateName(entity);
  }

  /**
   * Looked up by provider as well as id: the route is authorised per
   * provider, so without this a user with access to one supplier could edit
   * another supplier's product by pairing its id with their own provider's.
   */
  async updateNote(
    providerId: string,
    productId: string,
    note: string | null,
  ): Promise<Product> {
    const product = await this.productsRepo.findOneBy({
      id: productId,
      providerId,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const trimmed = note?.trim() ?? '';
    product.note = trimmed.length > 0 ? trimmed : null;
    return this.productsRepo.save(product);
  }

  findActiveByProvider(providerId: string): Promise<Product[]> {
    // Explicit order: without one, re-fetching after any write (e.g. the
    // bulk category-assignment toggle screen) can silently reshuffle the
    // list, which reads as rows jumping around while an admin is still
    // tapping through them.
    return this.productsRepo.find({
      where: { providerId, isActive: true },
      order: { name: 'ASC' },
      take: MAX_PRODUCTS_PER_QUERY,
    });
  }

  findActiveByBranch(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
  ): Promise<Product[]> {
    const providerWhere: FindOptionsWhere<Provider> = {
      branchId,
      isActive: true,
    };
    if (accessibleProviderIds !== 'ALL') {
      providerWhere.id = In(accessibleProviderIds);
    }
    return this.productsRepo.find({
      where: { isActive: true, provider: providerWhere },
      select: {
        id: true,
        providerId: true,
        name: true,
        barcode: true,
        additionalBarcodes: true,
      },
      take: MAX_PRODUCTS_PER_QUERY,
    });
  }

  /**
   * Matches a scanned/typed barcode against every active product in the
   * branch, without shipping the whole branch catalogue to the caller first.
   *
   * The barcode column holds whatever was originally typed or scanned — not
   * a normalised GTIN — so this narrows to rows that have at least one barcode (main or additional)
   * (a real cut at real catalogues, since most rows have none) and only then
   * runs the same GTIN-aware comparison the mobile client used to run
   * itself, in-process here instead of over the network to a phone.
   */
  async findByBarcodeInBranch(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
    barcode: string,
  ): Promise<Product[]> {
    const providerWhere: FindOptionsWhere<Provider> = {
      branchId,
      isActive: true,
    };
    if (accessibleProviderIds !== 'ALL') {
      providerWhere.id = In(accessibleProviderIds);
    }
    const scope = { isActive: true, provider: providerWhere };
    // Only rows with at least one barcode can match — a real cut, since most
    // rows have none.
    const candidates = await this.productsRepo.find({
      where: [
        { ...scope, barcode: Not(IsNull()) },
        {
          ...scope,
          additionalBarcodes: Raw((column) => `cardinality(${column}) > 0`),
        },
      ],
      select: {
        id: true,
        providerId: true,
        name: true,
        barcode: true,
        additionalBarcodes: true,
      },
      take: MAX_PRODUCTS_PER_QUERY,
    });
    const scannedKey = gtinMatchKey(barcode);
    return candidates.filter((product) =>
      barcodesOf(product).some((stored) =>
        // Mirrors matchesBarcode in mobile/src/barcode/matchesBarcode.ts: a
        // valid GTIN compares on its normalised key (so symbology prefixes and
        // stripped leading zeros still match); anything else falls back to
        // exact equality for suppliers' own non-GTIN codes.
        scannedKey !== null
          ? gtinMatchKey(stored) === scannedKey
          : stored === barcode,
      ),
    );
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productsRepo.findOneBy({ id });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(
    id: string,
    input: {
      name?: string;
      unitType?: string;
      barcode?: string;
      isActive?: boolean;
      categoryId?: string | null;
    },
  ): Promise<Product> {
    const product = await this.findById(id);
    if (input.categoryId) {
      await this.assertCategoryBelongsToProvider(
        input.categoryId,
        product.providerId,
      );
    }
    Object.assign(product, input);
    return this.saveRefusingDuplicateName(product);
  }

  /** The partial unique index on (provider, normalized name) for active products. */
  private async saveRefusingDuplicateName(product: Product): Promise<Product> {
    try {
      return await this.productsRepo.save(product);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A product with this name already exists for this provider',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    // order_items.productId is SET NULL on delete, so past orders keep
    // their productNameSnapshot/unitType and just lose the live product
    // link — order history is unaffected.
    const result = await this.productsRepo.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('Product not found');
    }
  }
}
