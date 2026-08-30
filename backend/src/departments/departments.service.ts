import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const existing = await this.departmentsRepo.findOneBy({
      branchId,
      name: input.name,
    });
    if (existing) {
      throw new ConflictException(
        'A department with this name already exists in this branch',
      );
    }
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
    if (input.name && input.name !== department.name) {
      const existing = await this.departmentsRepo.findOneBy({
        branchId: department.branchId,
        name: input.name,
      });
      if (existing) {
        throw new ConflictException(
          'A department with this name already exists in this branch',
        );
      }
    }
    Object.assign(department, input);
    return this.departmentsRepo.save(department);
  }

  async remove(id: string): Promise<void> {
    // provider_departments rows cascade on departmentId, so this just
    // un-links providers from the department without touching them.
    const result = await this.departmentsRepo.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('Department not found');
    }
  }
}
