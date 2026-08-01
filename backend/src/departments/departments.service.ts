import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Department } from './department.entity';
import { BranchesService } from '../branches/branches.service';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentsRepo: Repository<Department>,
    private readonly branchesService: BranchesService,
  ) {}

  async create(branchId: string, input: { name: string }): Promise<Department> {
    await this.branchesService.findById(branchId);
    const entity = this.departmentsRepo.create({ branchId, ...input });
    return this.departmentsRepo.save(entity);
  }

  findAllForBranch(branchId: string): Promise<Department[]> {
    return this.departmentsRepo.find({ where: { branchId } });
  }

  findByIds(ids: string[]): Promise<Department[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.departmentsRepo.find({ where: { id: In(ids) } });
  }

  async findById(id: string): Promise<Department> {
    const department = await this.departmentsRepo.findOneBy({ id });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  async update(
    id: string,
    input: { name?: string; isActive?: boolean },
  ): Promise<Department> {
    const department = await this.findById(id);
    Object.assign(department, input);
    return this.departmentsRepo.save(department);
  }
}
