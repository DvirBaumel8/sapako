import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Branch } from './branch.entity';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch) private readonly branchesRepo: Repository<Branch>,
  ) {}

  async create(input: { name: string; address?: string }): Promise<Branch> {
    const existing = await this.branchesRepo.findOneBy({ name: input.name });
    if (existing) {
      throw new ConflictException('A branch with this name already exists');
    }
    const entity = this.branchesRepo.create(input);
    return this.branchesRepo.save(entity);
  }

  // Ordered explicitly: without it Postgres returns rows in heap order, which
  // is insertion order right up until a row is updated and rewritten to the
  // end. Renaming a branch silently reordered it on every screen that lists
  // branches, which is five of them.
  findAll(): Promise<Branch[]> {
    return this.branchesRepo.find({ order: { createdAt: 'ASC' } });
  }

  findByIds(ids: string[]): Promise<Branch[]> {
    return this.branchesRepo.find({
      where: { id: In(ids) },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<Branch> {
    const branch = await this.branchesRepo.findOneBy({ id });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }
}
