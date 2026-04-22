import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('stores')
@ApiBearerAuth()
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @ApiOperation({ summary: 'List stores' })
  findAll(@CurrentUser() user: User) {
    return this.storesService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a store' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.storesService.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a store' })
  create(@CurrentUser() user: User, @Body() dto: CreateStoreDto) {
    return this.storesService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a store' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a store' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.storesService.remove(id, user.id);
  }
}
