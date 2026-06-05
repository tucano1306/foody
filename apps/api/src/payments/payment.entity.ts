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
      from: (v: string) => Number.parseFloat(v),
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
  @Column({ name: 'notification_days_before', default: 1, type: 'smallint' })
  notificationDaysBefore: number;

  @Column({ name: 'snoozed_until', nullable: true, type: 'timestamptz' })
  snoozedUntil: Date | null;

  @Column({ name: 'is_variable_amount', default: false })
  isVariableAmount: boolean;

  @Column({ name: 'is_auto_pay', default: false })
  isAutoPay: boolean;

  /** Preferred/default way this bill is normally paid */
  @Column({ name: 'payment_method', type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null;

  /** Bank or card issuer name for the default payment method */
  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName: string | null;

  /** Last 4 digits of the card/account (never store the full number) */
  @Column({ name: 'account_last4', type: 'varchar', length: 4, nullable: true })
  accountLast4: string | null;

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
