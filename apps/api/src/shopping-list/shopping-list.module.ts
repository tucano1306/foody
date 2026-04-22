import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShoppingListItem } from './shopping-list-item.entity';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingListController } from './shopping-list.controller';
import { Product } from '../products/product.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([ShoppingListItem, Product]), CommonModule],
  providers: [ShoppingListService],
  controllers: [ShoppingListController],
  exports: [ShoppingListService],
})
export class ShoppingListModule {}
