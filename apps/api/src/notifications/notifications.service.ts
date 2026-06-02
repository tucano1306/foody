import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { MonthlyPayment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { Product } from '../products/product.entity';
import { ProductPurchase } from '../products/product-purchase.entity';

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private webPushReady = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(MonthlyPayment)
    private readonly paymentsRepo: Repository<MonthlyPayment>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductPurchase)
    private readonly purchasesRepo: Repository<ProductPurchase>,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('webPush.publicKey');
    const privateKey = this.config.get<string>('webPush.privateKey');
    const contact = this.config.get<string>('webPush.contact') ?? 'mailto:admin@foody.app';

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
      return;
    }
    webPush.setVapidDetails(contact, publicKey, privateKey);
    this.webPushReady = true;
    this.logger.log('Web Push configured');
  }

  private async sendToUser(user: User, payload: NotificationPayload): Promise<boolean> {
    if (!this.webPushReady) return false;
    const sub = user.pushSubscription;
    if (!sub?.endpoint) return false;

    try {
      await webPush.sendNotification(sub, JSON.stringify(payload));
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 = subscription expired; clear it so we don't keep retrying
      if (status === 404 || status === 410) {
        await this.usersRepo.update(user.id, { pushSubscription: null });
        this.logger.log(`Removed expired push subscription for user ${user.id}`);
      } else {
        this.logger.error(`Push send failed for user ${user.id}:`, err);
      }
      return false;
    }
  }

  async sendTestNotification(userId: string, message: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return false;
    return this.sendToUser(user, {
      title: '🥑 Foody',
      body: message,
      url: '/home',
    });
  }

  // ─── Payment reminders — daily at 9 AM ─────────────────────────────────────
  @Cron('0 9 * * *')
  async sendPaymentReminders(): Promise<void> {
    this.logger.log('Running payment reminder notifications...');
    const now = new Date();
    const today = now.getDate();

    const allPayments = await this.paymentsRepo.find({
      where: { isActive: true },
      relations: ['user'],
    });

    for (const payment of allPayments) {
      if (payment.snoozedUntil && new Date(payment.snoozedUntil) > now) continue;
      const daysUntilDue = this.daysUntilDue(payment.dueDay, today);
      if (daysUntilDue <= payment.notificationDaysBefore && daysUntilDue >= 0) {
        await this.sendPaymentNotification(payment, daysUntilDue);
      }
    }
  }

  private daysUntilDue(dueDay: number, today: number): number {
    if (dueDay >= today) return dueDay - today;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return daysInMonth - today + dueDay;
  }

  private async sendPaymentNotification(payment: MonthlyPayment, daysUntilDue: number): Promise<void> {
    const user = payment.user;
    if (!user) return;

    const plural = daysUntilDue > 1 ? 's' : '';
    const body =
      daysUntilDue === 0
        ? `¡${payment.name} vence HOY! Monto: ${payment.currency} ${payment.amount}`
        : `${payment.name} vence en ${daysUntilDue} día${plural}. Monto: ${payment.currency} ${payment.amount}`;

    const ok = await this.sendToUser(user, {
      title: '💳 Foody — Recordatorio de pago',
      body,
      url: '/payments',
      data: { type: 'payment_reminder', paymentId: payment.id, daysUntilDue },
    });
    if (ok) this.logger.log(`Payment reminder sent: "${payment.name}" → user ${user.id}`);
  }

  // ─── Stock alerts — daily at 8 AM ──────────────────────────────────────────
  @Cron('0 8 * * *')
  async sendStockAlerts(): Promise<void> {
    this.logger.log('Running predictive stock alerts...');
    const products = await this.productsRepo.find({
      where: { stockLevel: 'full' },
      relations: ['user'],
    });

    for (const product of products) {
      const result = await this.estimateDaysRemaining(product);
      if (result === null) continue;

      const { daysRemaining, avgIntervalDays } = result;
      const alertThreshold = Math.max(3, Math.round(avgIntervalDays * 0.25));
      if (daysRemaining > alertThreshold) continue;

      if (await this.wasAlertedThisCycle(product.id, avgIntervalDays)) continue;
      await this.sendStockNotification(product, daysRemaining, avgIntervalDays);
    }
  }

  private async wasAlertedThisCycle(productId: string, avgIntervalDays: number): Promise<boolean> {
    const cycleStart = new Date(Date.now() - avgIntervalDays * 0.75 * 86_400_000);
    const recent = await this.purchasesRepo.findOne({
      where: { productId },
      order: { purchasedAt: 'DESC' },
    });
    if (!recent) return false;
    return new Date(recent.purchasedAt) >= cycleStart;
  }

  private async estimateDaysRemaining(
    product: Product,
  ): Promise<{ daysRemaining: number; avgIntervalDays: number } | null> {
    const purchases = await this.purchasesRepo.find({
      where: { productId: product.id },
      order: { purchasedAt: 'ASC' },
    });
    if (purchases.length < 2) return null;

    const dates = purchases.map((p) => new Date(p.purchasedAt).getTime());
    let totalIntervalMs = 0;
    for (let i = 1; i < dates.length; i++) totalIntervalMs += dates[i] - dates[i - 1];
    const avgIntervalDays = totalIntervalMs / (dates.length - 1) / 86_400_000;

    let stockFraction = 0.1;
    if (product.stockLevel === 'full') stockFraction = 1;
    else if (product.stockLevel === 'half') stockFraction = 0.5;

    return { daysRemaining: Math.round(avgIntervalDays * stockFraction), avgIntervalDays };
  }

  private async sendStockNotification(
    product: Product,
    daysRemaining: number,
    avgIntervalDays: number,
  ): Promise<void> {
    const user = product.user;
    if (!user) return;

    const firstName = user.name?.split(' ')[0] ?? null;
    const greeting = firstName ? `Hola ${firstName}, ` : '¡Hola! ';
    const cycleText = Math.round(avgIntervalDays);

    let body: string;
    if (daysRemaining <= 0) {
      body = `${greeting}parece que ${product.name} ya se agotó. ¡Te lo agregamos a la lista del súper! 🛒`;
    } else if (daysRemaining === 1) {
      body = `${greeting}basándonos en tu consumo habitual, ${product.name} te durará solo 1 día más. ¿Lo agregamos a la lista? 🛒`;
    } else {
      body = `${greeting}según tus patrones de compra (cada ~${cycleText} días), ${product.name} te durará unos ${daysRemaining} días más. ¡Buen momento para reponerlo! 🛒`;
    }

    const ok = await this.sendToUser(user, {
      title: '🥑 Foody — Se te acaba',
      body,
      url: '/shopping-trips',
      data: { type: 'stock_alert', productId: product.id, daysRemaining },
    });
    if (ok) this.logger.log(`Stock alert sent: "${product.name}" (~${daysRemaining}d) → user ${user.id}`);
  }
}

export type { PushSubscriptionData } from '../users/user.entity';
