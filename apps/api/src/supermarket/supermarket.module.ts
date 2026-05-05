import { Module } from '@nestjs/common';
import { SupermarketService } from './supermarket.service';
import { SupermarketController } from './supermarket.controller';

@Module({
  controllers: [SupermarketController],
  providers: [SupermarketService],
  exports: [SupermarketService],
})
export class SupermarketModule {}
