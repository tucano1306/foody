import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ nullable: true, type: 'varchar', length: 80 })
  chain: string | null;

  @Column({ nullable: true, type: 'varchar', length: 200 })
  location: string | null;

  @Column({ length: 3, default: 'MXN' })
  currency: string;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  color: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  icon: string | null;

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
