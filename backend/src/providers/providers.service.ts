// backend/src/providers/providers.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Provider } from './provider.entity';
import { Department } from '../departments/department.entity';
import { BranchesService } from '../branches/branches.service';
import { DepartmentsService } from '../departments/departments.service';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider)
    private readonly providersRepo: Repository<Provider>,
    private readonly branchesService: BranchesService,
    private readonly departmentsService: DepartmentsService,
  ) {}

  async create(
    branchId: string,
    input: { name: string; phone: string; departmentIds: string[] },
  ): Promise<Provider> {
    // Confirm the branch exists before inserting — otherwise an invalid
    // branchId escapes as an unhandled FK-violation 500 instead of a clean
    // 404 (same failure mode already fixed for grantAccess).
    await this.branchesService.findById(branchId);
    const { departmentIds, ...rest } = input;
    const departments = await this.resolveDepartments(branchId, departmentIds);
    const entity = this.providersRepo.create({
      branchId,
      ...rest,
      departments,
    });
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
    // This project's installed TypeORM version types `relations` as an
    // object map (matching the existing pattern in PermissionsService and
    // UsersService), not the string-array form.
    return this.providersRepo.find({
      where,
      relations: { departments: true },
    });
  }

  async findById(id: string): Promise<Provider> {
    const provider = await this.providersRepo.findOne({
      where: { id },
      relations: { departments: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  async update(
    id: string,
    input: {
      name?: string;
      phone?: string;
      isActive?: boolean;
      departmentIds?: string[];
    },
  ): Promise<Provider> {
    const provider = await this.findById(id);
    const { departmentIds, ...rest } = input;
    Object.assign(provider, rest);
    if (departmentIds) {
      provider.departments = await this.resolveDepartments(
        provider.branchId,
        departmentIds,
      );
    }
    return this.providersRepo.save(provider);
  }

  // Loads the requested departments and verifies every one exists and
  // belongs to this provider's branch — a provider can only be tagged with
  // departments from its own branch's list.
  private async resolveDepartments(
    branchId: string,
    departmentIds: string[],
  ): Promise<Department[]> {
    const departments = await this.departmentsService.findByIds(
      departmentIds,
    );
    if (departments.length !== departmentIds.length) {
      throw new NotFoundException('One or more departments not found');
    }
    const mismatched = departments.find(
      (department) => department.branchId !== branchId,
    );
    if (mismatched) {
      throw new NotFoundException(
        'Department does not belong to this branch',
      );
    }
    return departments;
  }
}
