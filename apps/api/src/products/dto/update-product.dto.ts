import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ description: 'Manually mark as running low' })
  @IsOptional()
  @IsBoolean()
  isRunningLow?: boolean;

  @ApiPropertyOptional({ description: 'Add to shopping list' })
  @IsOptional()
  @IsBoolean()
  needsShopping?: boolean;
}
