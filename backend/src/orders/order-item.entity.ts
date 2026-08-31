import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../products/product.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ nullable: true })
  productId?: string;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column()
  productNameSnapshot: string;

  @Column()
  unitType: string;

  // numeric, not int: weight units are ordered fractionally (2.5 kg).
  //
  // The transformer is load-bearing. node-postgres returns numeric as a
  // string to avoid losing precision through a float, so without it every
  // consumer would receive "2.50" — arithmetic would concatenate and the
  // WhatsApp message would read "2.50 ק\"ג" instead of "2.5".
  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  quantity: number;
}
