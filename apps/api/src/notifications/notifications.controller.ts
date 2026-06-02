import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey(): { key: string } {
    return { key: this.config.get<string>('webPush.publicKey') ?? '' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('test')
  async test(@CurrentUser() user: User): Promise<{ sent: boolean }> {
    const sent = await this.notificationsService.sendTestNotification(
      user.id,
      '¡Las notificaciones push están funcionando correctamente! 🥑',
    );
    return { sent };
  }
}
