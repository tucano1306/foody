import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShoppingTripsService } from './shopping-trips.service';
import { CreateShoppingTripDto } from './dto/create-shopping-trip.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('shopping-trips')
@ApiBearerAuth()
@Controller('shopping-trips')
export class ShoppingTripsController {
  constructor(private readonly tripsService: ShoppingTripsService) {}

  @Get()
  @ApiOperation({ summary: 'List recent shopping trips (tickets)' })
  findAll(@CurrentUser() user: User) {
    return this.tripsService.findAll(user.id);
  }

  @Get('by-store')
  @ApiOperation({ summary: 'Spending aggregated by store' })
  byStore(@CurrentUser() user: User) {
    return this.tripsService.byStore(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trip detail with items' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.tripsService.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a shopping trip with allocation' })
  create(@CurrentUser() user: User, @Body() dto: CreateShoppingTripDto) {
    return this.tripsService.create(user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a trip and recalculate product aggregates' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.tripsService.remove(id, user.id);
  }
}
