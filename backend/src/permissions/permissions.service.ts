import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProviderAccess } from './user-provider-access.entity';
import { UserDepartmentAccess } from './user-department-access.entity';
import { UserProviderBlock } from './user-provider-block.entity';
import { Provider } from '../providers/provider.entity';
import { Department } from '../departments/department.entity';
import { resolveAccess, AccessInput } from './resolveAccess';
import { Role } from '../users/role.enum';
import { AuthenticatedUser } from '../auth/jwt.strategy';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserProviderAccess)
    private readonly accessRepo: Repository<UserProviderAccess>,
    @InjectRepository(UserDepartmentAccess)
    private readonly departmentAccessRepo: Repository<UserDepartmentAccess>,
    @InjectRepository(UserProviderBlock)
    private readonly blockRepo: Repository<UserProviderBlock>,
    @InjectRepository(Provider)
    private readonly providerRepo: Repository<Provider>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) {}

  /** Providers of one branch with the departments they belong to. */
  private providersOfBranch(branchId: string): Promise<Provider[]> {
    return this.providerRepo.find({
      where: { branchId },
      relations: { departments: true },
    });
  }

  /**
   * Active departments only: an inactive department is not offered as something
   * to grant. An existing grant against one still resolves, the same way a block
   * outlives the grant it was made against (spec section 3.3).
   */
  private departmentsOfBranch(branchId: string): Promise<Department[]> {
    return this.departmentRepo.find({ where: { branchId, isActive: true } });
  }

  /**
   * The resolveAccess input for one user, over every provider (any branch).
   * Shared by every access check so the rule never exists in two places.
   */
  private async buildAccessInput(userId: string): Promise<{
    input: AccessInput;
    providers: Provider[];
  }> {
    const [direct, departmentGrants, blocks, providers] = await Promise.all([
      this.accessRepo.find({ where: { userId } }),
      this.departmentAccessRepo.find({ where: { userId } }),
      this.blockRepo.find({ where: { userId } }),
      this.providerRepo.find({ relations: { departments: true } }),
    ]);

    const input: AccessInput = {
      directProviderIds: direct.map((row) => row.providerId),
      blockedProviderIds: blocks.map((row) => row.providerId),
      grantedDepartmentIds: departmentGrants.map((row) => row.departmentId),
      departmentsByProviderId: Object.fromEntries(
        providers.map((provider) => [
          provider.id,
          (provider.departments ?? []).map((d) => ({ id: d.id, name: d.name })),
        ]),
      ),
    };

    return { input, providers };
  }

  async hasProviderAccess(
    user: AuthenticatedUser,
    providerId: string,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) {
      return true;
    }
    const { input } = await this.buildAccessInput(user.userId);
    return resolveAccess(providerId, input).isGranted;
  }

  async hasBranchAccess(
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) {
      return true;
    }
    const branchIds = await this.getAccessibleBranchIds(user);
    return branchIds !== 'ALL' && branchIds.includes(branchId);
  }

  async getAccessibleBranchIds(
    user: AuthenticatedUser,
  ): Promise<string[] | 'ALL'> {
    if (user.role === Role.ADMIN) {
      return 'ALL';
    }
    const { input, providers } = await this.buildAccessInput(user.userId);
    const branchIds = new Set(
      providers
        .filter((provider) => resolveAccess(provider.id, input).isGranted)
        .map((provider) => provider.branchId),
    );
    return Array.from(branchIds);
  }

  async getAccessibleProviderIds(
    user: AuthenticatedUser,
  ): Promise<string[] | 'ALL'> {
    if (user.role === Role.ADMIN) {
      return 'ALL';
    }
    const { input, providers } = await this.buildAccessInput(user.userId);
    return providers
      .filter((provider) => resolveAccess(provider.id, input).isGranted)
      .map((provider) => provider.id);
  }

  async getAccessForBranch(userId: string, branchId: string) {
    const [direct, departmentGrants, blocks, providers, departments] =
      await Promise.all([
        this.accessRepo.find({ where: { userId } }),
        this.departmentAccessRepo.find({ where: { userId } }),
        this.blockRepo.find({ where: { userId } }),
        this.providersOfBranch(branchId),
        this.departmentsOfBranch(branchId),
      ]);

    const input: AccessInput = {
      directProviderIds: direct.map((row) => row.providerId),
      blockedProviderIds: blocks.map((row) => row.providerId),
      grantedDepartmentIds: departmentGrants.map((row) => row.departmentId),
      departmentsByProviderId: Object.fromEntries(
        providers.map((provider) => [
          provider.id,
          (provider.departments ?? []).map((d) => ({ id: d.id, name: d.name })),
        ]),
      ),
    };

    return {
      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
        isGranted: input.grantedDepartmentIds.includes(department.id),
      })),
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        ...resolveAccess(provider.id, input),
      })),
    };
  }

  grant(userId: string, providerId: string): Promise<UserProviderAccess> {
    const entity = this.accessRepo.create({ userId, providerId });
    return this.accessRepo.save(entity);
  }

  revoke(userId: string, providerId: string): Promise<void> {
    return this.accessRepo.delete({ userId, providerId }).then(() => undefined);
  }
}
