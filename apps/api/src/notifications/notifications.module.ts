import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { MonthlyPayment } from '../payments/payment.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MonthlyPayment, User])],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
