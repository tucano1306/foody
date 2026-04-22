import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active monthly payments with status' })
  findAll(@CurrentUser() user: User) {
    return this.paymentsService.findAll(user.id);
  }

  @Get('by-category')
  @ApiOperation({ summary: 'Get monthly expenses aggregated by category' })
  byCategory(@CurrentUser() user: User) {
    return this.paymentsService.getExpensesByCategory(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single payment' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new monthly payment' })
  create(@CurrentUser() user: User, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a monthly payment' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: Partial<CreatePaymentDto>,
  ) {
    return this.paymentsService.update(id, user.id, dto as CreatePaymentDto);
  }

  @Post(':id/mark-paid')
  @ApiOperation({ summary: 'Mark payment as paid for the current month' })
  markAsPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.markAsPaid(id, user.id);
  }

  @Delete(':id/mark-paid')
  @ApiOperation({ summary: 'Undo payment mark for the current month' })
  markAsUnpaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.markAsUnpaid(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a monthly payment' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.remove(id, user.id);
  }
}
