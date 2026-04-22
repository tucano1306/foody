import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Walmart Satélite' })
  @IsNotEmpty()
  @IsString()
  @Length(1, 120)
  name: string;

  @ApiPropertyOptional({ example: 'Walmart' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  chain?: string;

  @ApiPropertyOptional({ example: 'Naucalpan, MX' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  location?: string;

  @ApiPropertyOptional({ example: 'MXN', default: 'MXN' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  color?: string;

  @ApiPropertyOptional({ example: '🛒' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  icon?: string;
}

export class UpdateStoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  chain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 10)
  icon?: string;
}
