import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from '../users/user.entity';

export type PriceSource = 'manual' | 'allocated' | 'unknown';

@Entity('product_purchases')
@Index(['productId', 'purchasedAt'])
export class ProductPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number.parseFloat(v),
    },
  })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number.parseFloat(v)),
    },
  })
  unitPrice: number | null;

  @Column({
    name: 'total_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number.parseFloat(v)),
    },
  })
  totalPrice: number | null;

  @Column({
    name: 'price_source',
    type: 'varchar',
    length: 20,
    default: 'manual',
  })
  priceSource: PriceSource;

  @Column({ length: 3, default: 'MXN' })
  currency: string;

  @Column({ name: 'purchased_at', type: 'timestamptz' })
  purchasedAt: Date;

  @Column({ name: 'store_id', nullable: true, type: 'uuid' })
  storeId: string | null;

  @Column({ name: 'store_name', nullable: true, type: 'varchar', length: 200 })
  storeName: string | null;

  @Column({ name: 'trip_id', nullable: true, type: 'uuid' })
  tripId: string | null;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'household_id', nullable: true, type: 'uuid' })
  householdId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
