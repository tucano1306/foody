import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as OneSignal from '@onesignal/node-onesignal';
import { MonthlyPayment } from '../payments/payment.entity';
import { User } from '../users/user.entity';

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

    const message =
      daysUntilDue === 0
        ? `¡${payment.name} vence HOY! Monto: ${payment.currency} ${payment.amount}`
        : `${payment.name} vence en ${daysUntilDue} día${daysUntilDue > 1 ? 's' : ''}. Monto: ${payment.currency} ${payment.amount}`;

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
}
