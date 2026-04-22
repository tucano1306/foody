import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './store.entity';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Store]), CommonModule],
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService, TypeOrmModule],
})
export class StoresModule {}
