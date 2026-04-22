import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Length,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Leche', description: 'Product name' })
  @IsNotEmpty()
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({ example: 'Leche entera 1L' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'S3 photo URL' })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ example: 'Lácteos' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  category?: string;

  @ApiPropertyOptional({ example: 2, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentQuantity?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @ApiPropertyOptional({ example: 'litros', default: 'units' })
  @IsOptional()
  @IsString()
  unit?: string;
}
