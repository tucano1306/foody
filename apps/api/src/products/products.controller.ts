import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { StorageService } from '../storage/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all products for current user' })
  findAll(@CurrentUser() user: User) {
    return this.productsService.findAll(user.id);
  }

  @Get('running-low')
  @ApiOperation({ summary: 'Get products that are running low / need shopping' })
  findRunningLow(@CurrentUser() user: User) {
    return this.productsService.findRunningLow(user.id);
  }

  @Get('upload-url')
  @ApiOperation({ summary: 'Get presigned S3 URL to upload a product photo' })
  @ApiQuery({ name: 'fileName', required: true })
  @ApiQuery({ name: 'contentType', required: true })
  getUploadUrl(
    @Query('fileName') fileName: string,
    @Query('contentType') contentType: string,
  ) {
    return this.storageService.getPresignedUploadUrl(fileName, contentType);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.productsService.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  create(@CurrentUser() user: User, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.id, dto);
  }

  @Patch(':id/mark-low')
  @ApiOperation({ summary: 'Mark a product as running low' })
  markLow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.productsService.markRunningLow(id, user.id);
  }

  @Patch(':id/mark-ok')
  @ApiOperation({ summary: 'Mark a product as stocked (remove from shopping list)' })
  markOk(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.productsService.markOk(id, user.id);
  }

  @Patch(':id/stock-level')
  @ApiOperation({
    summary: 'Set the stock level (full / half / empty). half & empty add the product to the shopping list automatically.',
  })
  setStockLevel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateStockLevelDto,
  ) {
    return this.productsService.setStockLevel(id, user.id, dto.level);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.productsService.remove(id, user.id);
  }

  // ─── Purchases ─────────────────────────────────────────────────────────
  @Post(':id/purchases')
  @ApiOperation({ summary: 'Register a purchase (updates stock + aggregates)' })
  registerPurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.productsService.registerPurchase(id, user.id, dto);
  }

  @Get(':id/purchases')
  @ApiOperation({ summary: 'List purchase history for a product' })
  listPurchases(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.productsService.listPurchases(id, user.id);
  }

  @Delete(':id/purchases/:purchaseId')
  @ApiOperation({ summary: 'Delete a purchase and recalculate aggregates' })
  deletePurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @CurrentUser() user: User,
  ) {
    return this.productsService.deletePurchase(id, purchaseId, user.id);
  }
}
