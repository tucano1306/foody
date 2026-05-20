import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('test')
  async test(@CurrentUser() user: User): Promise<{ sent: boolean }> {
    const sent = await this.notificationsService.sendTestNotification(
      user.id,
      '¡Las notificaciones push están funcionando correctamente! 🥑',
    );
    return { sent };
  }
}
