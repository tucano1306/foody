import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
  Length,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 'Netflix' })
  @IsNotEmpty()
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({ example: 'Streaming de video' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 15.99, description: 'Amount to pay' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  currency?: string;

  @ApiProperty({ example: 15, description: 'Day of month when payment is due (1-31)' })
  @IsNumber()
  @Min(1)
  @Max(31)
  dueDay: number;

  @ApiPropertyOptional({ example: 'streaming' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  category?: string;

  @ApiPropertyOptional({ example: 3, default: 3, description: 'Days before due date to notify' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  notificationDaysBefore?: number;
}
