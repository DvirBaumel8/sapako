import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from './role.enum';

const SALT_ROUNDS = 12;

/** A `User` shape safe to send in an HTTP response — never carries `passwordHash`. */
export type SafeUser = Omit<User, 'passwordHash'>;

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

  /** Strips `passwordHash` before a `User` is sent out over HTTP. */
  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      providerAccess: user.providerAccess,
    };
  }
}
