import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonthlyPayment } from './payment.entity';
import { PaymentRecord } from './payment-record.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PartialType } from '@nestjs/swagger';

class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(MonthlyPayment)
    private readonly paymentsRepo: Repository<MonthlyPayment>,
    @InjectRepository(PaymentRecord)
    private readonly recordsRepo: Repository<PaymentRecord>,
  ) {}

  private getMonthYear(): { month: number; year: number } {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }

  private daysUntilDue(dueDay: number): number {
    const now = new Date();
    const today = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    if (dueDay >= today) {
      return dueDay - today;
    }
    // Due next month
    return daysInMonth - today + dueDay;
  }

  async findAll(userId: string): Promise<(MonthlyPayment & { isPaidThisMonth: boolean; daysUntilDue: number; currentRecord?: PaymentRecord })[]> {
    const payments = await this.paymentsRepo.find({
      where: { userId, isActive: true },
      order: { dueDay: 'ASC' },
    });

    const { month, year } = this.getMonthYear();

    const records = await this.recordsRepo.find({
      where: { userId, month, year },
    });

    const recordMap = new Map(records.map((r) => [r.paymentId, r]));

    return payments.map((p) => {
      const currentRecord = recordMap.get(p.id);
      return Object.assign(p, {
        isPaidThisMonth: currentRecord?.status === 'paid',
        daysUntilDue: this.daysUntilDue(p.dueDay),
        currentRecord,
      });
    });
  }

  async findOne(id: string, userId: string): Promise<MonthlyPayment> {
    const payment = await this.paymentsRepo.findOne({ where: { id, userId } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  async create(userId: string, dto: CreatePaymentDto): Promise<MonthlyPayment> {
    const payment = this.paymentsRepo.create({ ...dto, userId });
    return this.paymentsRepo.save(payment);
  }

  async update(id: string, userId: string, dto: UpdatePaymentDto): Promise<MonthlyPayment> {
    const payment = await this.findOne(id, userId);
    Object.assign(payment, dto);
    return this.paymentsRepo.save(payment);
  }

  async remove(id: string, userId: string): Promise<void> {
    const payment = await this.findOne(id, userId);
    await this.paymentsRepo.remove(payment);
  }

  async markAsPaid(id: string, userId: string): Promise<PaymentRecord> {
    const payment = await this.findOne(id, userId);
    const { month, year } = this.getMonthYear();

    let record = await this.recordsRepo.findOne({
      where: { paymentId: id, userId, month, year },
    });

    if (record) {
      record.status = 'paid';
      record.paidAt = new Date();
    } else {
      record = this.recordsRepo.create({
        paymentId: id,
        userId,
        month,
        year,
        amount: payment.amount,
        status: 'paid',
        paidAt: new Date(),
      });
    }

    return this.recordsRepo.save(record);
  }

  async markAsUnpaid(id: string, userId: string): Promise<void> {
    const { month, year } = this.getMonthYear();
    await this.recordsRepo.delete({ paymentId: id, userId, month, year });
  }

  /** Used by notifications scheduler */
  async getUpcomingPayments(
    userId: string,
    withinDays = 7,
  ): Promise<MonthlyPayment[]> {
    const payments = await this.paymentsRepo.find({
      where: { userId, isActive: true },
    });

    return payments.filter(
      (p) => this.daysUntilDue(p.dueDay) <= withinDays,
    );
  }

  async getTotalMonthlyExpenses(userId: string): Promise<number> {
    const result = await this.paymentsRepo
      .createQueryBuilder('p')
      .select('SUM(p.amount)', 'total')
      .where('p.user_id = :userId AND p.is_active = true', { userId })
      .getRawOne<{ total: string }>();

    return Number.parseFloat(result?.total ?? '0');
  }

  async getExpensesByCategory(
    userId: string,
  ): Promise<Array<{ category: string; total: number; count: number }>> {
    const rows = await this.paymentsRepo
      .createQueryBuilder('p')
      .select('COALESCE(p.category, :other)', 'category')
      .addSelect('SUM(p.amount)', 'total')
      .addSelect('COUNT(p.id)', 'count')
      .where('p.user_id = :userId AND p.is_active = true', {
        userId,
        other: 'other',
      })
      .groupBy('p.category')
      .orderBy('total', 'DESC')
      .getRawMany<{ category: string; total: string; count: string }>();

    return rows.map((r) => ({
      category: r.category,
      total: Number.parseFloat(r.total),
      count: Number.parseInt(r.count, 10),
    }));
  }
}
