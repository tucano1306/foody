import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Household } from './household.entity';
import { HouseholdInvite } from './household-invite.entity';
import { User } from '../users/user.entity';
import { HouseholdsService } from './households.service';
import { HouseholdsController } from './households.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Household, HouseholdInvite, User])],
  providers: [HouseholdsService],
  controllers: [HouseholdsController],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
