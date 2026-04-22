import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import type { AllocationStrategy } from '../shopping-trip.entity';

export class ShoppingTripItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 32.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ example: 65 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;
}

export class CreateShoppingTripDto {
  @ApiPropertyOptional({ description: 'Store ID. Optional if storeName is provided.' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Free-form store name when storeId is not set' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  storeName?: string;

  @ApiPropertyOptional({ example: '2026-04-21T10:00:00Z', description: 'Defaults to now' })
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiProperty({ example: 380.5, description: 'Total amount on the receipt' })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @ApiPropertyOptional({ example: 'MXN', default: 'MXN' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({
    enum: ['equal', 'by_quantity', 'manual_partial', 'none'],
    default: 'manual_partial',
  })
  @IsOptional()
  @IsEnum(['equal', 'by_quantity', 'manual_partial', 'none'])
  allocationStrategy?: AllocationStrategy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  receiptPhotoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ShoppingTripItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ShoppingTripItemDto)
  items: ShoppingTripItemDto[];
}
