import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Provider } from './provider.entity';
import { BranchesService } from '../branches/branches.service';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider)
    private readonly providersRepo: Repository<Provider>,
    private readonly branchesService: BranchesService,
  ) {}

  async create(
    branchId: string,
    input: { name: string; phone: string },
  ): Promise<Provider> {
    // Confirm the branch exists before inserting — otherwise an invalid
    // branchId escapes as an unhandled FK-violation 500 instead of a clean
    // 404 (same failure mode already fixed for grantAccess).
    await this.branchesService.findById(branchId);
    const entity = this.providersRepo.create({ branchId, ...input });
    return this.providersRepo.save(entity);
  }

  findActiveByBranch(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
  ): Promise<Provider[]> {
    const where: FindOptionsWhere<Provider> = { branchId, isActive: true };
    if (accessibleProviderIds !== 'ALL') {
      where.id = In(accessibleProviderIds);
    }
    return this.providersRepo.find({ where });
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
