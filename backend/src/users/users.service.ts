import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from './role.enum';

const SALT_ROUNDS = 12;

/**
 * A `User` shape safe to send in an HTTP response — never carries
 * `passwordHash`. Branded so only `toSafeUser()` can produce one: since
 * TypeScript's excess-property checks don't fire on values passed through a
 * variable, an unbranded `Omit<User, 'passwordHash'>` would let a raw
 * `User` (with `passwordHash` still attached) be returned from a
 * `Promise<SafeUser>`-typed function without any compiler error.
 *
 * providerAccessCount is the resolved count (direct grants AND department
 * grants, the same rule a real request is checked against) — not
 * `providerAccess.length`, which is only direct grants and understates
 * anyone reachable through a department, silently and with no indication
 * in the UI that it's happening.
 */
export type SafeUser = Omit<User, 'passwordHash' | 'providerAccess'> & {
  providerAccessCount: number;
  readonly __brand: 'SafeUser';
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async create(input: {
    username: string;
    password: string;
    role: Role;
  }): Promise<User> {
    const existing = await this.findByUsername(input.username);
    if (existing) {
      throw new ConflictException('Username is already taken');
    }
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const entity = this.usersRepo.create({
      username: input.username,
      passwordHash,
      role: input.role,
    });
    return this.usersRepo.save(entity);
  }

  async update(
    id: string,
    input: { username?: string; password?: string },
  ): Promise<User> {
    const user = await this.findById(id);

    if (input.username && input.username !== user.username) {
      const existing = await this.findByUsername(input.username);
      if (existing && existing.id !== id) {
        throw new ConflictException('Username is already taken');
      }
      user.username = input.username;
    }

    if (input.password) {
      user.passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    }

    return this.usersRepo.save(user);
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  findAll(): Promise<User[]> {
    return this.usersRepo.find();
  }

  findAdmins(): Promise<User[]> {
    return this.usersRepo.find({ where: { role: Role.ADMIN } });
  }

  countAll(): Promise<number> {
    return this.usersRepo.count();
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    if (user.role === Role.ADMIN) {
      // Losing the last admin bricks the app — nothing left with the role
      // required to manage users, providers, or anything else admin-gated.
      const adminCount = await this.usersRepo.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new ConflictException('Cannot delete the last remaining admin');
      }
    }
    // user_provider_access and orders both cascade on this user's id.
    await this.usersRepo.delete({ id });
  }

  /**
   * Strips `passwordHash` before a `User` is sent out over HTTP. This is
   * the only place allowed to produce a `SafeUser` — the cast below is the
   * one authorized escape hatch for the brand.
   */
  toSafeUser(user: User, providerAccessCount: number): SafeUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      providerAccessCount,
    } as SafeUser;
  }
}
