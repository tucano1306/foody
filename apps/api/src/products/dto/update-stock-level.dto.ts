import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';
import type { StockLevel } from '../product.entity';

export class UpdateStockLevelDto {
  @ApiProperty({
    enum: ['full', 'half', 'empty'],
    example: 'half',
    description: 'full = tengo stock, half = queda menos de la mitad, empty = se acabó',
  })
  @IsNotEmpty()
  @IsIn(['full', 'half', 'empty'])
  level: StockLevel;
}
