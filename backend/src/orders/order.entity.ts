import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Branch } from '../branches/branch.entity';
import { Provider } from '../providers/provider.entity';
import { User } from '../users/user.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from './order-status.enum';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column()
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: User;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * When the user confirmed the message was actually sent.
   *
   * Deliberately not set at handoff: it is the time the supplier was
   * contacted, and an order the user opened WhatsApp for and then abandoned
   * never reaches this state at all.
   */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  /** When WhatsApp was opened, which is all the app can observe by itself. */
  @Column({ type: 'timestamptz', nullable: true })
  handedOffAt?: Date;

  /**
   * When the record email went out. Null after a confirmed send means the
   * email failed — it is never allowed to fail the confirmation itself, so
   * without this column an outage would show up only as mail quietly
   * ceasing to arrive.
   */
  @Column({ type: 'timestamptz', nullable: true })
  notificationSentAt?: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];
}
