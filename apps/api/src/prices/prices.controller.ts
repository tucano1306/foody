import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PricesService } from './prices.service';
import { CachePriceDto } from './dto/cache-price.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('prices')
@ApiBearerAuth()
@Controller('prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get('compare')
  @ApiOperation({ summary: 'Compare prices for a product across supermarkets' })
  @ApiQuery({ name: 'productId', required: true, type: String })
  compare(
    @Query('productId') productId: string,
    @CurrentUser() user: User,
  ) {
    return this.pricesService.compare(productId, user.id);
  }

  @Post('cache')
  @ApiOperation({ summary: 'Upsert a price in the cache for a product/supermarket' })
  cache(@Body() dto: CachePriceDto) {
    return this.pricesService.upsertCache(dto);
  }
}
