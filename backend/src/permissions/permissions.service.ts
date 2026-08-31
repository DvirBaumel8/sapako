import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    // Deliberately not buildAccessInput: this runs in a guard on every
    // provider-scoped request, and that helper loads every provider in the
    // system with its departments joined. Only the provider being asked
    // about is needed to answer the question.
    const [direct, departmentGrants, blocks, provider] = await Promise.all([
      this.accessRepo.find({ where: { userId: user.userId } }),
      this.departmentAccessRepo.find({ where: { userId: user.userId } }),
      this.blockRepo.find({ where: { userId: user.userId } }),
      this.providerRepo.findOne({
        where: { id: providerId },
        relations: { departments: true },
      }),
    ]);
    if (!provider) {
      return false;
    }
    return resolveAccess(providerId, {
      directProviderIds: direct.map((row) => row.providerId),
      blockedProviderIds: blocks.map((row) => row.providerId),
      grantedDepartmentIds: departmentGrants.map((row) => row.departmentId),
      departmentsByProviderId: {
        [provider.id]: (provider.departments ?? []).map((department) => ({
          id: department.id,
          name: department.name,
        })),
      },
    }).isGranted;
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

  /** Grants or revokes one provider, choosing the mechanism the rule requires. */
  async setProviderAccess(
    userId: string,
    providerId: string,
    granted: boolean,
  ) {
    const provider = await this.providerRepo.findOne({
      where: { id: providerId },
      relations: { departments: true },
    });
    if (!provider) throw new NotFoundException();
    const departmentGrants = await this.departmentAccessRepo.find({
      where: { userId },
    });
    const grantedDepartmentIds = departmentGrants.map(
      (row) => row.departmentId,
    );
    const reachedByDepartment = (provider.departments ?? []).some(
      (department) => grantedDepartmentIds.includes(department.id),
    );

    if (granted) {
      // Clearing the block is always right; a direct grant is only needed when
      // no department would reach it anyway.
      await this.blockRepo.delete({ userId, providerId });
      if (!reachedByDepartment) {
        await this.accessRepo.save({ userId, providerId });
      }
      return;
    }

    await this.accessRepo.delete({ userId, providerId });
    if (reachedByDepartment) {
      // Only a department keeps it reachable, so an exception is required.
      await this.blockRepo.save({ userId, providerId });
    }
  }

  async setDepartmentAccess(
    userId: string,
    departmentId: string,
    granted: boolean,
  ) {
    if (granted) {
      await this.departmentAccessRepo.save({ userId, departmentId });
      return;
    }
    // Direct grants inside the department are left alone — see spec 3.3.
    await this.departmentAccessRepo.delete({ userId, departmentId });
  }

  /**
   * Grants or revokes every department in a branch at once.
   *
   * Deliberately not the same thing as setBranchAccess, which writes a direct
   * grant per provider. A department grant is a standing rule: a provider
   * added to one of these departments tomorrow is reachable without anyone
   * revisiting the permissions screen, where a direct grant would have to be
   * added by hand. With 33 departments in the live catalogue, doing this one
   * row at a time is 33 round-trips.
   */
  async setAllDepartmentsAccess(
    userId: string,
    branchId: string,
    granted: boolean,
  ) {
    const departments = await this.departmentsOfBranch(branchId);
    const departmentIds = departments.map((department) => department.id);
    if (departmentIds.length === 0) return;

    if (granted) {
      await this.departmentAccessRepo.save(
        departmentIds.map((departmentId) => ({ userId, departmentId })),
      );
      return;
    }

    // Direct provider grants inside these departments are left alone, matching
    // what revoking a single department does — see spec 3.3. Revoking the
    // rule must not silently withdraw access somebody granted explicitly.
    await this.departmentAccessRepo.delete({
      userId,
      departmentId: In(departmentIds),
    });
  }

  async setBranchAccess(userId: string, branchId: string, granted: boolean) {
    const [providers, departments] = await Promise.all([
      this.providersOfBranch(branchId),
      this.departmentsOfBranch(branchId),
    ]);
    const providerIds = providers.map((provider) => provider.id);
    const departmentIds = departments.map((department) => department.id);
    if (providerIds.length === 0) return;

    if (granted) {
      await this.blockRepo.delete({ userId, providerId: In(providerIds) });
      await this.accessRepo.save(
        providerIds.map((providerId) => ({ userId, providerId })),
      );
      return;
    }

    await this.accessRepo.delete({ userId, providerId: In(providerIds) });
    await this.blockRepo.delete({ userId, providerId: In(providerIds) });
    if (departmentIds.length > 0) {
      await this.departmentAccessRepo.delete({
        userId,
        departmentId: In(departmentIds),
      });
    }
  }
}
