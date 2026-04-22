import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MonthlyPayment } from './payment.entity';
import { User } from '../users/user.entity';

export type PaymentStatus = 'pending' | 'paid' | 'overdue';

@Entity('payment_records')
export class PaymentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id' })
  paymentId: string;

  @ManyToOne(() => MonthlyPayment, (p) => p.records, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment: MonthlyPayment;

  @Column({ type: 'smallint' })
  month: number;

  @Column({ type: 'smallint' })
  year: number;

  @Column({ name: 'paid_at', nullable: true, type: 'timestamp' })
  paidAt: Date | null;

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

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PaymentStatus;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
