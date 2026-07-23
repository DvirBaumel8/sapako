import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from './provider.entity';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider)
    private readonly providersRepo: Repository<Provider>,
  ) {}

  create(
    branchId: string,
    input: { name: string; phone: string },
  ): Promise<Provider> {
    const entity = this.providersRepo.create({ branchId, ...input });
    return this.providersRepo.save(entity);
  }

  findActiveByBranch(branchId: string): Promise<Provider[]> {
    return this.providersRepo.find({ where: { branchId, isActive: true } });
  }

  async findById(id: string): Promise<Provider> {
    const provider = await this.providersRepo.findOneBy({ id });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  async update(
    id: string,
    input: { name?: string; phone?: string; isActive?: boolean },
  ): Promise<Provider> {
    const provider = await this.findById(id);
    Object.assign(provider, input);
    return this.providersRepo.save(provider);
  }
}
