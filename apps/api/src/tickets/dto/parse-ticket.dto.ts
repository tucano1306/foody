import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ParseTicketDto {
  @ApiProperty({ description: 'Raw OCR text from the receipt' })
  @IsString()
  @IsNotEmpty()
  rawText: string;
}
