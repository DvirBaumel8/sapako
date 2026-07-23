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
import { UserProviderAccess } from '../permissions/user-provider-access.entity';

const SALT_ROUNDS = 12;

/**
 * A `User` shape safe to send in an HTTP response — never carries
 * `passwordHash`. Branded so only `toSafeUser()` can produce one: since
 * TypeScript's excess-property checks don't fire on values passed through a
 * variable, an unbranded `Omit<User, 'passwordHash'>` would let a raw
 * `User` (with `passwordHash` still attached) be returned from a
 * `Promise<SafeUser>`-typed function without any compiler error.
 */
export type SafeUser = Omit<User, 'passwordHash' | 'providerAccess'> & {
  providerAccess?: UserProviderAccess[];
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

  findAllWithAccess(): Promise<User[]> {
    // This project's installed TypeORM version types `relations` as an
    // object map (matching the existing pattern in PermissionsService),
    // not the string-array form — see users.service.spec.ts for coverage.
    return this.usersRepo.find({ relations: { providerAccess: true } });
  }

  countAll(): Promise<number> {
    return this.usersRepo.count();
  }

  /**
   * Strips `passwordHash` before a `User` is sent out over HTTP. This is
   * the only place allowed to produce a `SafeUser` — the cast below is the
   * one authorized escape hatch for the brand.
   */
  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      providerAccess: user.providerAccess,
    } as SafeUser;
  }
}
