import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Store } from '../stores/store.entity';

export type AllocationStrategy = 'equal' | 'by_quantity' | 'manual_partial' | 'none';

@Entity('shopping_trips')
@Index(['householdId', 'purchasedAt'])
@Index(['userId', 'purchasedAt'])
export class ShoppingTrip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store_id', nullable: true, type: 'uuid' })
  storeId: string | null;

  @ManyToOne(() => Store, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'store_id' })
  store: Store | null;

  @Column({ name: 'store_name', nullable: true, type: 'varchar', length: 200 })
  storeName: string | null;

  @Column({ name: 'purchased_at', type: 'timestamptz' })
  purchasedAt: Date;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number.parseFloat(v),
    },
  })
  totalAmount: number;

  @Column({ length: 3, default: 'MXN' })
  currency: string;

  @Column({
    name: 'allocation_strategy',
    type: 'varchar',
    length: 30,
    default: 'manual_partial',
  })
  allocationStrategy: AllocationStrategy;

  @Column({ name: 'receipt_photo_url', nullable: true, type: 'varchar', length: 500 })
  receiptPhotoUrl: string | null;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'household_id', nullable: true, type: 'uuid' })
  householdId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
