import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Role } from './role.enum';
import { UserProviderAccess } from '../permissions/user-provider-access.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.STAFF })
  role: Role;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => UserProviderAccess, (access) => access.user)
  providerAccess: UserProviderAccess[];
}
