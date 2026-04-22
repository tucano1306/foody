import { Controller, Get, Post, Patch, Delete, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShoppingListService } from './shopping-list.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';

@ApiTags('shopping-list')
@ApiBearerAuth()
@Controller('shopping-list')
export class ShoppingListController {
  constructor(private readonly shoppingListService: ShoppingListService) {}

  @Get()
  @ApiOperation({ summary: 'Get all pending shopping list items (supermarket mode)' })
  getList(@CurrentUser() user: User) {
    return this.shoppingListService.getList(user.id);
  }

  @Get('frequent')
  @ApiOperation({ summary: 'Get frequently purchased products (stats) — útil para sugerencias' })
  getFrequent(@CurrentUser() user: User) {
    return this.shoppingListService.getFrequentlyPurchased(user.id);
  }

  @Patch(':id/toggle-cart')
  @ApiOperation({ summary: 'Toggle an item as in-cart / not in cart' })
  toggleInCart(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.shoppingListService.toggleInCart(id, user.id);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Finish shopping — mark all in-cart items as purchased and reset product stock flags' })
  async completeShopping(@CurrentUser() user: User) {
    await this.shoppingListService.completeShopping(user.id);
    return { message: 'Shopping completed. Products have been restocked.' };
  }

  @Delete('purchased')
  @ApiOperation({ summary: 'Clear all purchased items from history' })
  clearPurchased(@CurrentUser() user: User) {
    return this.shoppingListService.clearPurchased(user.id);
  }
}
