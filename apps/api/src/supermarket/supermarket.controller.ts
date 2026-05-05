import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SupermarketService } from './supermarket.service';

@ApiTags('supermarket')
@ApiBearerAuth()
@Controller('supermarket')
export class SupermarketController {
  constructor(private readonly supermarketService: SupermarketService) {}

  @Get('walmart')
  @ApiOperation({ summary: 'Search products on Walmart' })
  @ApiQuery({ name: 'query', required: true, type: String })
  searchWalmart(@Query('query') query: string) {
    return this.supermarketService.searchWalmart(query);
  }

  @Get('publix')
  @ApiOperation({ summary: 'Search products on Publix' })
  @ApiQuery({ name: 'query', required: true, type: String })
  searchPublix(@Query('query') query: string) {
    return this.supermarketService.searchPublix(query);
  }

  @Get('compare')
  @ApiOperation({ summary: 'Compare prices for a query across Walmart and Publix' })
  @ApiQuery({ name: 'query', required: true, type: String })
  compare(@Query('query') query: string) {
    return this.supermarketService.compare(query);
  }
}
