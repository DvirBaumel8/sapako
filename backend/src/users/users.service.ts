import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from './role.enum';

const SALT_ROUNDS = 12;

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

  countAll(): Promise<number> {
    return this.usersRepo.count();
  }
}
