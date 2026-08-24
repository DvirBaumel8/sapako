import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Product } from './product.entity';
import { Provider } from '../providers/provider.entity';
import { ProvidersService } from '../providers/providers.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly providersService: ProvidersService,
  ) {}

  async create(
    providerId: string,
    input: { name: string; unitType: string; barcode?: string },
  ): Promise<Product> {
    // Confirm the provider exists before inserting — otherwise an invalid
    // providerId escapes as an unhandled FK-violation 500 instead of a
    // clean 404 (same failure mode already fixed for grantAccess).
    await this.providersService.findById(providerId);
    const entity = this.productsRepo.create({ providerId, ...input });
    return this.productsRepo.save(entity);
  }

  findActiveByProvider(providerId: string): Promise<Product[]> {
    return this.productsRepo.find({ where: { providerId, isActive: true } });
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
      select: { id: true, providerId: true, name: true, barcode: true },
    });
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
    },
  ): Promise<Product> {
    const product = await this.findById(id);
    Object.assign(product, input);
    return this.productsRepo.save(product);
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
