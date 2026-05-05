import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { ParseTicketDto } from './dto/parse-ticket.dto';
import { SaveTicketDto } from './dto/save-ticket.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('parse')
  @ApiOperation({ summary: 'Parse raw OCR text and return structured items' })
  parse(@Body() dto: ParseTicketDto) {
    return this.ticketsService.parse(dto);
  }

  @Post('save')
  @ApiOperation({ summary: 'Save a parsed receipt as a ticket' })
  save(@CurrentUser() user: User, @Body() dto: SaveTicketDto) {
    return this.ticketsService.save(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List recent tickets for current user' })
  findAll(@CurrentUser() user: User) {
    return this.ticketsService.findAll(user.id);
  }
}
