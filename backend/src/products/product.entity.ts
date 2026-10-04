import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Provider } from '../providers/provider.entity';
import { Category } from '../categories/category.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column()
  name: string;

  @Column()
  unitType: string;

  @Column({ nullable: true })
  barcode?: string;

  // Every other barcode this product is known by — a product sold under
  // several barcodes (different packers, a supplier's own short code next to
  // the GTIN) is still one product to order.
  @Column('text', { array: true, default: () => "'{}'" })
  additionalBarcodes: string[];

  // Set on a duplicate that was merged into another product and hidden.
  // Kept so the merge can be undone; null on every live product.
  @Column({ type: 'uuid', nullable: true })
  mergedIntoProductId?: string | null;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ nullable: true })
  categoryId?: string;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: Category;

  // Internal reminder for staff ordering this product. Never sent to the
  // supplier — it is not part of the WhatsApp message or the order email.
  @Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
