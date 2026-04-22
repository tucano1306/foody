import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeUpdate,
  BeforeInsert,
} from 'typeorm';
import { User } from '../users/user.entity';

export type StockLevel = 'full' | 'half' | 'empty';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ name: 'photo_url', nullable: true, type: 'varchar' })
  photoUrl: string | null;

  @Column({ nullable: true, type: 'varchar', length: 100 })
  category: string | null;

  @Column({
    name: 'current_quantity',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number.parseFloat(v),
    },
  })
  currentQuantity: number;

  @Column({
    name: 'min_quantity',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 1,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number.parseFloat(v),
    },
  })
  minQuantity: number;

  @Column({ default: 'units', length: 50 })
  unit: string;

  @Column({
    name: 'stock_level',
    type: 'varchar',
    length: 10,
    default: 'full',
  })
  stockLevel: StockLevel;

  @Column({ name: 'is_running_low', default: false })
  isRunningLow: boolean;

  @Column({ name: 'needs_shopping', default: false })
  needsShopping: boolean;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'household_id', nullable: true, type: 'uuid' })
  householdId: string | null;

  // ─── Purchase aggregates (updated by ProductsService.registerPurchase) ───
  @Column({
    name: 'last_purchase_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number.parseFloat(v)),
    },
  })
  lastPurchasePrice: number | null;

  @Column({ name: 'last_purchase_date', type: 'timestamptz', nullable: true })
  lastPurchaseDate: Date | null;

  @Column({
    name: 'avg_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number.parseFloat(v)),
    },
  })
  avgPrice: number | null;

  @Column({
    name: 'total_spent',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number.parseFloat(v),
    },
  })
  totalSpent: number;

  @Column({
    name: 'total_purchased_qty',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number.parseFloat(v),
    },
  })
  totalPurchasedQty: number;

  @Column({ length: 3, default: 'MXN' })
  currency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ─── Computed ────────────────────────────────────────────────────────────
  get status(): 'ok' | 'low' | 'empty' {
    if (this.stockLevel === 'empty') return 'empty';
    if (this.stockLevel === 'half') return 'low';
    return 'ok';
  }

  @BeforeInsert()
  @BeforeUpdate()
  syncRunningLow(): void {
    // Keep legacy flags aligned with stockLevel (shopping-list logic depends on them)
    if (this.stockLevel === 'empty' || this.stockLevel === 'half') {
      this.isRunningLow = true;
      this.needsShopping = true;
    } else {
      this.isRunningLow = false;
      this.needsShopping = false;
    }
  }
}
