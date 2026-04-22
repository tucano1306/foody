import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';

@Entity('shopping_list_items')
export class ShoppingListItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({
    name: 'quantity_needed',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 1,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => Number.parseFloat(v),
    },
  })
  quantityNeeded: number;

  @Column({ name: 'is_in_cart', default: false })
  isInCart: boolean;

  @Column({ name: 'is_purchased', default: false })
  isPurchased: boolean;

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
