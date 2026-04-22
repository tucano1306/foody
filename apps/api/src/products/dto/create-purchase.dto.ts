import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsDateString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({ example: 2, description: 'Quantity purchased (in product unit)' })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 32.5, description: 'Unit price. Either unitPrice or totalPrice is required.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ example: 65, description: 'Total paid. Either unitPrice or totalPrice is required.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  @ApiPropertyOptional({ example: 'MXN', default: 'MXN' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: '2026-04-21T10:00:00Z', description: 'Defaults to now' })
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiPropertyOptional({ description: 'Known store ID' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ example: 'Walmart', description: 'Free-form store name when no storeId' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  storeName?: string;
}
