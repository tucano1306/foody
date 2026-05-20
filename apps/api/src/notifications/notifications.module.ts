import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MonthlyPayment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { Product } from '../products/product.entity';
import { ProductPurchase } from '../products/product-purchase.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MonthlyPayment, User, Product, ProductPurchase])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
