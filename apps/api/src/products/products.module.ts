import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductPurchase } from './product-purchase.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ShoppingListModule } from '../shopping-list/shopping-list.module';
import { StorageModule } from '../storage/storage.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductPurchase]),
    ShoppingListModule,
    StorageModule,
    CommonModule,
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
