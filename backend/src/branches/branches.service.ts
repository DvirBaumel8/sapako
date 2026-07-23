import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Branch } from './branch.entity';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch) private readonly branchesRepo: Repository<Branch>,
  ) {}

  create(input: { name: string; address?: string }): Promise<Branch> {
    const entity = this.branchesRepo.create(input);
    return this.branchesRepo.save(entity);
  }

  findAll(): Promise<Branch[]> {
    return this.branchesRepo.find();
  }

  findByIds(ids: string[]): Promise<Branch[]> {
    return this.branchesRepo.find({ where: { id: In(ids) } });
  }
}
