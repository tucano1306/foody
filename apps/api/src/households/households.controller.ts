import { Controller, Get, Post, Delete, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HouseholdsService } from './households.service';
import { CreateHouseholdDto, JoinHouseholdDto } from './dto/household.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('households')
@ApiBearerAuth()
@Controller('households')
export class HouseholdsController {
  constructor(private readonly service: HouseholdsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current household + members' })
  me(@CurrentUser() user: User) {
    return this.service.getMyHousehold(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new household' })
  create(@CurrentUser() user: User, @Body() dto: CreateHouseholdDto) {
    return this.service.create(user.id, dto.name);
  }

  @Post('invites')
  @ApiOperation({ summary: 'Generate an invite code' })
  invite(@CurrentUser() user: User) {
    return this.service.createInvite(user.id);
  }

  @Post('join')
  @ApiOperation({ summary: 'Join a household with invite code' })
  join(@CurrentUser() user: User, @Body() dto: JoinHouseholdDto) {
    return this.service.join(user.id, dto.code);
  }

  @Delete('leave')
  @ApiOperation({ summary: 'Leave current household' })
  leave(@CurrentUser() user: User) {
    return this.service.leave(user.id);
  }
}
