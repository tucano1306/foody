import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ShoppingListItem } from './shopping-list-item.entity';
import { Product } from '../products/product.entity';
import { ScopeService } from '../common/scope.service';

@Injectable()
export class ShoppingListService {
  constructor(
    @InjectRepository(ShoppingListItem)
    private readonly itemsRepo: Repository<ShoppingListItem>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly scopeService: ScopeService,
  ) {}

  async getList(userId: string): Promise<ShoppingListItem[]> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>;
    return this.itemsRepo.find({
      where: { ...base, isPurchased: false },
      order: { isInCart: 'DESC', createdAt: 'ASC' },
    });
  }

  async addToList(userId: string, productId: string, quantityNeeded = 1): Promise<ShoppingListItem> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>;
    // Avoid duplicates (shared across household members)
    const existing = await this.itemsRepo.findOne({
      where: { ...base, productId, isPurchased: false },
    });

    if (existing) {
      return existing;
    }

    const item = this.itemsRepo.create({
      userId,
      householdId: scope.householdId,
      productId,
      quantityNeeded,
    });
    return this.itemsRepo.save(item);
  }

  async removeFromListByProduct(userId: string, productId: string): Promise<void> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>;
    await this.itemsRepo.delete({ ...base, productId, isPurchased: false });
  }

  async toggleInCart(itemId: string, userId: string): Promise<ShoppingListItem> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>;
    const item = await this.itemsRepo.findOneOrFail({ where: { ...base, id: itemId } });
    item.isInCart = !item.isInCart;
    return this.itemsRepo.save(item);
  }

  async completeShopping(userId: string): Promise<void> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>;

    // Find all in-cart items first so we know which products to restock
    const inCart = await this.itemsRepo.find({
      where: { ...base, isInCart: true, isPurchased: false },
    });
    const productIds = inCart.map((i) => i.productId);

    // Mark all in-cart items as purchased (scoped)
    const qb = this.itemsRepo
      .createQueryBuilder()
      .update(ShoppingListItem)
      .set({ isPurchased: true, isInCart: false })
      .where('is_in_cart = true');

    if (scope.householdId) {
      qb.andWhere('household_id = :householdId', { householdId: scope.householdId });
    } else {
      qb.andWhere('user_id = :userId AND household_id IS NULL', { userId });
    }
    await qb.execute();

    // Reset matching products back to "full" stock
    if (productIds.length > 0) {
      await this.productsRepo
        .createQueryBuilder()
        .update(Product)
        .set({ stockLevel: 'full', isRunningLow: false, needsShopping: false })
        .whereInIds(productIds)
        .execute();
    }
  }

  async clearPurchased(userId: string): Promise<void> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>;
    await this.itemsRepo.delete({ ...base, isPurchased: true });
  }

  async countPending(userId: string): Promise<number> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>;
    return this.itemsRepo.count({ where: { ...base, isPurchased: false } });
  }

  async getFrequentlyPurchased(
    userId: string,
    limit = 10,
  ): Promise<Array<{ productId: string; name: string; photoUrl: string | null; purchases: number; lastPurchasedAt: Date }>> {
    const scope = await this.scopeService.resolve(userId);

    const qb = this.itemsRepo
      .createQueryBuilder('item')
      .innerJoin('item.product', 'product')
      .select('item.product_id', 'product_id')
      .addSelect('product.name', 'name')
      .addSelect('product.photo_url', 'photo_url')
      .addSelect('COUNT(item.id)', 'purchases')
      .addSelect('MAX(item.updated_at)', 'last_purchased_at')
      .where('item.is_purchased = true');

    if (scope.householdId) {
      qb.andWhere('item.household_id = :householdId', { householdId: scope.householdId });
    } else {
      qb.andWhere('item.user_id = :userId AND item.household_id IS NULL', { userId });
    }

    const rows: Array<{
      product_id: string;
      name: string;
      photo_url: string | null;
      purchases: string;
      last_purchased_at: Date;
    }> = await qb
      .groupBy('item.product_id')
      .addGroupBy('product.name')
      .addGroupBy('product.photo_url')
      .orderBy('purchases', 'DESC')
      .limit(limit)
      .getRawMany();

    return rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      photoUrl: r.photo_url,
      purchases: Number.parseInt(r.purchases, 10),
      lastPurchasedAt: r.last_purchased_at,
    }));
  }
}
