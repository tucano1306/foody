import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as OneSignal from '@onesignal/node-onesignal';
import { MonthlyPayment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { Product } from '../products/product.entity';
import { ProductPurchase } from '../products/product-purchase.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly onesignalClient: ReturnType<typeof OneSignal.createConfiguration> extends never
    ? never
    : OneSignal.DefaultApi;

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
  ) {
    const appKey = this.config.get<string>('onesignal.apiKey');
    const configuration = OneSignal.createConfiguration({
      restApiKey: appKey ?? '',
    });
    this.onesignalClient = new OneSignal.DefaultApi(configuration);
  }

  // ─── Runs every day at 9 AM ───────────────────────────────────────────────
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

  private async sendPaymentNotification(
    payment: MonthlyPayment,
    daysUntilDue: number,
  ): Promise<void> {
    const user = payment.user;

    if (!user?.onesignalPlayerId) {
      this.logger.warn(
        `User ${user?.id ?? payment.userId} has no OneSignal player ID — skipping notification`,
      );
      return;
    }

    const appId = this.config.get<string>('onesignal.appId');
    if (!appId) {
      this.logger.error('ONESIGNAL_APP_ID is not configured');
      return;
    }

    const plural = daysUntilDue > 1 ? 's' : '';
    const message =
      daysUntilDue === 0
        ? `¡${payment.name} vence HOY! Monto: ${payment.currency} ${payment.amount}`
        : `${payment.name} vence en ${daysUntilDue} día${plural}. Monto: ${payment.currency} ${payment.amount}`;

    try {
      const notification = new OneSignal.Notification();
      notification.app_id = appId;
      notification.include_subscription_ids = [user.onesignalPlayerId];
      notification.contents = { en: message, es: message };
      notification.headings = { en: '💳 Foody — Recordatorio de pago', es: '💳 Foody — Recordatorio de pago' };
      notification.data = {
        type: 'payment_reminder',
        paymentId: payment.id,
        daysUntilDue,
      };

      await this.onesignalClient.createNotification(notification);
      this.logger.log(`Notification sent for payment "${payment.name}" to user ${user.id}`);
    } catch (err) {
      this.logger.error(`Failed to send notification for payment ${payment.id}`, err);
    }
  }

  /** Manual trigger — called when a payment is created or updated */
  async sendTestNotification(userId: string, message: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });

    if (!user?.onesignalPlayerId) return false;

    const appId = this.config.get<string>('onesignal.appId');
    if (!appId) return false;

    try {
      const notification = new OneSignal.Notification();
      notification.app_id = appId;
      notification.include_subscription_ids = [user.onesignalPlayerId];
      notification.contents = { en: message, es: message };
      notification.headings = { en: '🥑 Foody', es: '🥑 Foody' };

      await this.onesignalClient.createNotification(notification);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Runs every day at 8 AM — predictive stock alerts ────────────────────
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

      // Alert threshold: whichever is larger — 3 days or 25% of the avg cycle
      const alertThreshold = Math.max(3, Math.round(avgIntervalDays * 0.25));
      if (daysRemaining > alertThreshold) continue;

      // Deduplicate: only alert once per "running low" cycle.
      // We consider the product was already alerted if the last purchase was
      // recent enough that the cycle hasn't reset (stock still > 0).
      const alreadyAlerted = await this.wasAlertedThisCycle(product.id, avgIntervalDays);
      if (alreadyAlerted) continue;

      await this.sendStockNotification(product, daysRemaining, avgIntervalDays);
    }
  }

  /**
   * Returns true if we already sent a stock alert in the current consumption cycle.
   * We track this by checking if there's a purchase newer than (now - avgInterval).
   * If not, the alert was sent in a previous cycle — safe to alert again.
   */
  private async wasAlertedThisCycle(productId: string, avgIntervalDays: number): Promise<boolean> {
    const cycleStart = new Date(Date.now() - avgIntervalDays * 0.75 * 86_400_000);
    const recent = await this.purchasesRepo.findOne({
      where: { productId },
      order: { purchasedAt: 'DESC' },
    });
    if (!recent) return false;
    // If last purchase is within 75% of the avg cycle, we're still in the same cycle
    return new Date(recent.purchasedAt) >= cycleStart;
  }

  /**
   * Calculates estimated days until a product runs out based on:
   * 1. Average interval between purchases (consumption rate)
   * 2. Current stock level as a fraction
   */
  private async estimateDaysRemaining(product: Product): Promise<{ daysRemaining: number; avgIntervalDays: number } | null> {
    const purchases = await this.purchasesRepo.find({
      where: { productId: product.id },
      order: { purchasedAt: 'ASC' },
    });

    if (purchases.length < 2) return null;

    const dates = purchases.map((p) => new Date(p.purchasedAt).getTime());
    let totalIntervalMs = 0;
    for (let i = 1; i < dates.length; i++) {
      totalIntervalMs += dates[i] - dates[i - 1];
    }
    const avgIntervalDays = totalIntervalMs / (dates.length - 1) / 86_400_000;

    let stockFraction = 0.1;
    if (product.stockLevel === 'full') stockFraction = 1;
    else if (product.stockLevel === 'half') stockFraction = 0.5;

    return { daysRemaining: Math.round(avgIntervalDays * stockFraction), avgIntervalDays };
  }

  private async sendStockNotification(product: Product, daysRemaining: number, avgIntervalDays: number): Promise<void> {
    const user = product.user;
    if (!user?.onesignalPlayerId) return;

    const appId = this.config.get<string>('onesignal.appId');
    if (!appId) return;

    const firstName = user.name?.split(' ')[0] ?? null;
    const greeting = firstName ? `Hola ${firstName}, ` : '¡Hola! ';
    const cycleText = Math.round(avgIntervalDays);

    let message: string;
    if (daysRemaining <= 0) {
      message = `${greeting}parece que ${product.name} ya se agotó. ¡Te lo agregamos a la lista del súper! 🛒`;
    } else if (daysRemaining === 1) {
      message = `${greeting}basándonos en tu consumo habitual, ${product.name} te durará solo 1 día más. ¿Lo agregamos a la lista? 🛒`;
    } else {
      message = `${greeting}según tus patrones de compra (cada ~${cycleText} días), ${product.name} te durará unos ${daysRemaining} días más. ¡Buen momento para reponerlo! 🛒`;
    }

    try {
      const notification = new OneSignal.Notification();
      notification.app_id = appId;
      notification.include_subscription_ids = [user.onesignalPlayerId];
      notification.contents = { en: message, es: message };
      notification.headings = { en: '🥑 Foody — Se te acaba', es: '🥑 Foody — Se te acaba' };
      notification.data = { type: 'stock_alert', productId: product.id, daysRemaining };

      await this.onesignalClient.createNotification(notification);
      this.logger.log(`Stock alert sent for "${product.name}" (~${daysRemaining}d) to user ${user.id}`);
    } catch (err) {
      this.logger.error(`Failed to send stock alert for product ${product.id}`, err);
    }
  }
}
