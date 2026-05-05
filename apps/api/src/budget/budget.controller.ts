import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BudgetService } from './budget.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('budget')
@ApiBearerAuth()
@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('estimate')
  @ApiOperation({ summary: 'Estimate cost of current shopping list' })
  @ApiQuery({ name: 'listId', required: false, type: String })
  estimate(
    @CurrentUser() user: User,
    @Query('listId') listId?: string,
  ) {
    return this.budgetService.estimate(user.id, listId ?? null);
  }

  @Get('history')
  @ApiOperation({ summary: 'Monthly spending history (last 12 months)' })
  history(@CurrentUser() user: User) {
    return this.budgetService.history(user.id);
  }
}
