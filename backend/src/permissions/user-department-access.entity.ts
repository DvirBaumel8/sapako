import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Department } from '../departments/department.entity';

/** Grants every provider in the department, including ones added later. */
@Entity('user_department_access')
export class UserDepartmentAccess {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  departmentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'departmentId' })
  department: Department;
}
