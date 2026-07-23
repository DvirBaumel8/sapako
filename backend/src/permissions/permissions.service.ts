import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProviderAccess } from './user-provider-access.entity';
import { Role } from '../users/role.enum';
import { AuthenticatedUser } from '../auth/jwt.strategy';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserProviderAccess)
    private readonly accessRepo: Repository<UserProviderAccess>,
  ) {}

  async hasProviderAccess(
    user: AuthenticatedUser,
    providerId: string,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) {
      return true;
    }
    const access = await this.accessRepo.findOne({
      where: { userId: user.userId, providerId },
    });
    return !!access;
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
    const rows = await this.accessRepo.find({
      where: { userId: user.userId },
      relations: { provider: true },
    });
    const branchIds = new Set(rows.map((row) => row.provider.branchId));
    return Array.from(branchIds);
  }

  async getAccessibleProviderIds(
    user: AuthenticatedUser,
  ): Promise<string[] | 'ALL'> {
    if (user.role === Role.ADMIN) {
      return 'ALL';
    }
    const rows = await this.accessRepo.find({
      where: { userId: user.userId },
    });
    return rows.map((row) => row.providerId);
  }

  grant(userId: string, providerId: string): Promise<UserProviderAccess> {
    const entity = this.accessRepo.create({ userId, providerId });
    return this.accessRepo.save(entity);
  }

  revoke(userId: string, providerId: string): Promise<void> {
    return this.accessRepo.delete({ userId, providerId }).then(() => undefined);
  }
}
