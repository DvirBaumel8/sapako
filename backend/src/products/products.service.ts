import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  create(
    providerId: string,
    input: { name: string; unitType: string; barcode?: string },
  ): Promise<Product> {
    const entity = this.productsRepo.create({ providerId, ...input });
    return this.productsRepo.save(entity);
  }

  findActiveByProvider(providerId: string): Promise<Product[]> {
    return this.productsRepo.find({ where: { providerId, isActive: true } });
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
}
