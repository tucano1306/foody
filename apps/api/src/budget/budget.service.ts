import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ShoppingTrip } from '../shopping-trips/shopping-trip.entity';
import { ShoppingListItem } from '../shopping-list/shopping-list-item.entity';
import { ProductPurchase } from '../products/product-purchase.entity';
import { ScopeService } from '../common/scope.service';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface BudgetEstimate {
  listId: string | null;
  itemCount: number;
  estimatedTotal: number;
  currency: string;
  note: string;
}

export interface BudgetHistoryEntry {
  month: string; // 'YYYY-MM'
  total: number;
  tripCount: number;
  currency: string;
}

@Injectable()
export class BudgetService {
  constructor(
    @InjectRepository(ShoppingTrip)
    private readonly tripsRepo: Repository<ShoppingTrip>,
    @InjectRepository(ShoppingListItem)
    private readonly listRepo: Repository<ShoppingListItem>,
    @InjectRepository(ProductPurchase)
    private readonly purchasesRepo: Repository<ProductPurchase>,
    private readonly scopeService: ScopeService,
  ) {}

  async estimate(userId: string, listId: string | null): Promise<BudgetEstimate> {
    const scope = await this.scopeService.resolve(userId);

    // Build query for pending shopping list items
    const where: FindOptionsWhere<ShoppingListItem> = {
      ...(this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingListItem>),
      isPurchased: false,
    };

    const items = await this.listRepo.find({ where, relations: ['product'] });

    if (items.length === 0) {
      return { listId, itemCount: 0, estimatedTotal: 0, currency: 'MXN', note: 'Empty list' };
    }

    // Estimate using last known purchase price for each product
    let estimatedTotal = 0;
    let priced = 0;

    for (const item of items) {
      const lastPurchase = await this.purchasesRepo.findOne({
        where: { productId: item.productId },
        order: { purchasedAt: 'DESC' },
      });

      if (lastPurchase?.unitPrice) {
        estimatedTotal += lastPurchase.unitPrice * Number(item.quantityNeeded);
        priced++;
      }
    }

    return {
      listId,
      itemCount: items.length,
      estimatedTotal: round2(estimatedTotal),
      currency: 'MXN',
      note:
        priced < items.length
          ? `Estimated from ${priced}/${items.length} items with price history`
          : 'Estimated from full price history',
    };
  }

  async history(userId: string): Promise<BudgetHistoryEntry[]> {
    const scope = await this.scopeService.resolve(userId);

    const raw = await this.tripsRepo
      .createQueryBuilder('t')
      .select("TO_CHAR(t.purchased_at, 'YYYY-MM')", 'month')
      .addSelect('SUM(t.total_spent)', 'total')
      .addSelect('COUNT(t.id)', 'tripCount')
      .where(
        scope.householdId
          ? 't.household_id = :householdId'
          : 't.user_id = :userId',
        scope.householdId
          ? { householdId: scope.householdId }
          : { userId: scope.userId },
      )
      .groupBy("TO_CHAR(t.purchased_at, 'YYYY-MM')")
      .orderBy("TO_CHAR(t.purchased_at, 'YYYY-MM')", 'DESC')
      .limit(12)
      .getRawMany<{ month: string; total: string; tripcount: string }>();

    return raw.map((r) => ({
      month: r.month,
      total: round2(Number.parseFloat(r.total ?? '0')),
      tripCount: Number.parseInt(r.tripcount ?? '0', 10),
      currency: 'MXN',
    }));
  }
}
