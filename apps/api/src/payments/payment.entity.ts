import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { PaymentRecord } from './payment-record.entity';

@Entity('monthly_payments')
export class MonthlyPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v),
    },
  })
  amount: number;

  @Column({ default: 'USD', length: 10 })
  currency: string;

  /** Day of the month when payment is due (1–31) */
  @Column({ name: 'due_day', type: 'smallint' })
  dueDay: number;

  @Column({ nullable: true, type: 'varchar', length: 100 })
  category: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Days before due date to send notification */
  @Column({ name: 'notification_days_before', default: 3, type: 'smallint' })
  notificationDaysBefore: number;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => PaymentRecord, (r) => r.payment, { cascade: true })
  records: PaymentRecord[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
