import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetService } from './budget.service';
import { BudgetController } from './budget.controller';
import { ShoppingTrip } from '../shopping-trips/shopping-trip.entity';
import { ShoppingListItem } from '../shopping-list/shopping-list-item.entity';
import { ProductPurchase } from '../products/product-purchase.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShoppingTrip, ShoppingListItem, ProductPurchase]),
    CommonModule,
  ],
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
