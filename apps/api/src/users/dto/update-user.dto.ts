import { IsObject, IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { PushSubscriptionData } from '../user.entity';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'User display name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ description: 'Web Push subscription object (PushSubscription.toJSON())' })
  @IsOptional()
  @IsObject()
  pushSubscription?: PushSubscriptionData | null;
}
