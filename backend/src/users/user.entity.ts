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

  // Lets a STAFF user manage products and categories of the suppliers they
  // can already access. Ignored for ADMIN, who can do everything anyway.
  @Column({ default: false })
  canEditProducts: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => UserProviderAccess, (access) => access.user)
  providerAccess: UserProviderAccess[];
}
