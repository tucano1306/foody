import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { ScopeService } from './scope.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [ScopeService],
  exports: [ScopeService],
})
export class CommonModule {}
