import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShoppingTrip } from './shopping-trip.entity';
import { ShoppingTripsService } from './shopping-trips.service';
import { ShoppingTripsController } from './shopping-trips.controller';
import { Product } from '../products/product.entity';
import { ProductPurchase } from '../products/product-purchase.entity';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShoppingTrip, Product, ProductPurchase]),
    ProductsModule,
    StoresModule,
    CommonModule,
  ],
  providers: [ShoppingTripsService],
  controllers: [ShoppingTripsController],
})
export class ShoppingTripsModule {}
