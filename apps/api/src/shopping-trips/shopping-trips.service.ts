import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { ShoppingTrip, AllocationStrategy } from './shopping-trip.entity';
import { CreateShoppingTripDto, ShoppingTripItemDto } from './dto/create-shopping-trip.dto';
import { Product } from '../products/product.entity';
import { ProductPurchase, PriceSource } from '../products/product-purchase.entity';
import { ProductsService } from '../products/products.service';
import { Store } from '../stores/store.entity';
import { ScopeService } from '../common/scope.service';

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface ResolvedItem {
  product: Product;
  quantity: number;
  manualUnitPrice: number | null;
  manualTotalPrice: number | null;
}

@Injectable()
export class ShoppingTripsService {
  constructor(
    @InjectRepository(ShoppingTrip)
    private readonly tripsRepo: Repository<ShoppingTrip>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductPurchase)
    private readonly purchasesRepo: Repository<ProductPurchase>,
    private readonly productsService: ProductsService,
    private readonly scopeService: ScopeService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(userId: string): Promise<ShoppingTrip[]> {
    const scope = await this.scopeService.resolve(userId);
    return this.tripsRepo.find({
      where: this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingTrip>,
      order: { purchasedAt: 'DESC' },
      take: 50,
    });
  }

  async byStore(
    userId: string,
  ): Promise<Array<{ storeName: string; total: number; count: number }>> {
    const scope = await this.scopeService.resolve(userId);
    // Aggregate directly from product_purchases so both individual
    // purchases (registered from a product card) and trip items count.
    // Join stores to resolve store_id -> name, fall back to purchase.store_name.
    const qb = this.purchasesRepo
      .createQueryBuilder('p')
      .leftJoin(Store, 's', 's.id = p.store_id')
      .select(
        "COALESCE(s.name, p.store_name, 'Sin tienda')",
        'storeName',
      )
      .addSelect(
        'SUM(COALESCE(p.total_price, p.unit_price * p.quantity, 0))',
        'total',
      )
      .addSelect('COUNT(*)', 'count');
    if (scope.householdId) {
      qb.where('p.household_id = :hid', { hid: scope.householdId });
    } else {
      qb.where('p.user_id = :uid', { uid: userId }).andWhere(
        'p.household_id IS NULL',
      );
    }
    qb.groupBy('"storeName"').orderBy(
      'SUM(COALESCE(p.total_price, p.unit_price * p.quantity, 0))',
      'DESC',
    );
    const rows = await qb.getRawMany<{
      storeName: string;
      total: string;
      count: string;
    }>();
    return rows.map((r) => ({
      storeName: r.storeName,
      total: Number.parseFloat(r.total) || 0,
      count: Number.parseInt(r.count, 10) || 0,
    }));
  }

  async findOne(id: string, userId: string): Promise<ShoppingTrip & { items: ProductPurchase[] }> {
    const scope = await this.scopeService.resolve(userId);
    const trip = await this.tripsRepo.findOne({
      where: {
        ...(this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingTrip>),
        id,
      },
    });
    if (!trip) throw new NotFoundException(`Trip ${id} not found`);
    const items = await this.purchasesRepo.find({
      where: { tripId: trip.id },
      order: { createdAt: 'ASC' },
    });
    return Object.assign(trip, { items });
  }

  async create(userId: string, dto: CreateShoppingTripDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('items is required');
    }

    const strategy: AllocationStrategy = dto.allocationStrategy ?? 'manual_partial';
    const currency = dto.currency ?? 'MXN';

    return this.dataSource.transaction(async (manager) => {
      const scope = await this.scopeService.resolve(userId);

      // Resolve store (optional)
      let storeId: string | null = null;
      let storeName: string | null = dto.storeName ?? null;
      if (dto.storeId) {
        const store = await manager.findOne(Store, { where: { id: dto.storeId } });
        if (!store) throw new NotFoundException(`Store ${dto.storeId} not found`);
        storeId = store.id;
        storeName = store.name;
      }

      // Load products in scope
      const productIds = dto.items.map((i) => i.productId);
      const products = await manager.find(Product, { where: { id: In(productIds) as never } });
      const productsById = new Map(products.map((p) => [p.id, p]));

      const resolved: ResolvedItem[] = dto.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
        // Scope check
        if (scope.householdId) {
          if (product.householdId !== scope.householdId) {
            throw new NotFoundException(`Product ${item.productId} not found`);
          }
        } else if (product.userId !== userId) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }
        const manualUnit = normalizeManual(item);
        return {
          product,
          quantity: item.quantity,
          manualUnitPrice: manualUnit.unitPrice,
          manualTotalPrice: manualUnit.totalPrice,
        };
      });

      // Compute allocations
      const totalAmount = round2(dto.totalAmount);
      const allocations = allocate(resolved, totalAmount, strategy);

      // Persist trip first (we need id)
      const trip = manager.create(ShoppingTrip, {
        storeId,
        storeName,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : new Date(),
        totalAmount,
        currency,
        allocationStrategy: strategy,
        receiptPhotoUrl: dto.receiptPhotoUrl ?? null,
        notes: dto.notes ?? null,
        userId,
        householdId: scope.householdId,
      });
      const savedTrip = await manager.save(trip);

      // Apply each purchase
      const appliedPurchases: ProductPurchase[] = [];
      for (let i = 0; i < resolved.length; i += 1) {
        const item = resolved[i];
        const alloc = allocations[i];
        const { product, purchase } = await this.productsService.applyPurchase(manager, {
          product: item.product,
          quantity: item.quantity,
          unitPrice: alloc.unitPrice,
          totalPrice: alloc.totalPrice,
          priceSource: alloc.priceSource,
          currency,
          purchasedAt: savedTrip.purchasedAt,
          storeId,
          storeName,
          tripId: savedTrip.id,
          userId,
        });
        appliedPurchases.push(purchase);
        // Store back (loop mutation to avoid stale reference)
        item.product = product;
      }

      return { trip: savedTrip, items: appliedPurchases };
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const scope = await this.scopeService.resolve(userId);
      const trip = await manager.findOne(ShoppingTrip, {
        where: {
          ...(this.scopeService.whereFragment(scope) as FindOptionsWhere<ShoppingTrip>),
          id,
        },
      });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);

      const items = await manager.find(ProductPurchase, { where: { tripId: trip.id } });
      const productIds = Array.from(new Set(items.map((i) => i.productId)));

      // Undo aggregates
      for (const item of items) {
        const product = await manager.findOne(Product, { where: { id: item.productId } });
        if (!product) continue;
        product.totalPurchasedQty = Math.max(0, round2(product.totalPurchasedQty - item.quantity));
        product.totalSpent = Math.max(
          0,
          round2(product.totalSpent - (item.totalPrice ?? 0)),
        );
        await manager.save(product);
      }

      await manager.remove(items);
      await manager.remove(trip);

      // Recompute avgPrice + last purchase for affected products
      for (const pid of productIds) {
        const product = await manager.findOne(Product, { where: { id: pid } });
        if (!product) continue;
        const manualAgg = await manager
          .createQueryBuilder(ProductPurchase, 'pp')
          .select('COALESCE(SUM(pp.total_price), 0)', 'sum')
          .addSelect('COALESCE(SUM(pp.quantity), 0)', 'qty')
          .where('pp.product_id = :pid', { pid })
          .andWhere("pp.price_source = 'manual'")
          .getRawOne<{ sum: string; qty: string }>();
        const manualSum = Number.parseFloat(manualAgg?.sum ?? '0');
        const manualQty = Number.parseFloat(manualAgg?.qty ?? '0');
        product.avgPrice = manualQty > 0 ? round2(manualSum / manualQty) : null;
        const latest = await manager.findOne(ProductPurchase, {
          where: { productId: pid },
          order: { purchasedAt: 'DESC' },
        });
        product.lastPurchasePrice = latest?.unitPrice ?? null;
        product.lastPurchaseDate = latest?.purchasedAt ?? null;
        await manager.save(product);
      }
    });
  }
}

function normalizeManual(
  item: ShoppingTripItemDto,
): { unitPrice: number | null; totalPrice: number | null } {
  if (item.unitPrice == null && item.totalPrice == null) {
    return { unitPrice: null, totalPrice: null };
  }
  const unit =
    item.unitPrice == null
      ? round2((item.totalPrice ?? 0) / item.quantity)
      : round2(item.unitPrice);
  const total =
    item.totalPrice == null ? round2(unit * item.quantity) : round2(item.totalPrice);
  return { unitPrice: unit, totalPrice: total };
}

interface Allocation {
  unitPrice: number | null;
  totalPrice: number | null;
  priceSource: PriceSource;
}

function allocate(
  items: ResolvedItem[],
  totalAmount: number,
  strategy: AllocationStrategy,
): Allocation[] {
  const n = items.length;
  if (n === 0) return [];

  // Strategy: none → keep manual only, no allocation
  if (strategy === 'none') {
    return items.map((it) => {
      if (it.manualUnitPrice != null && it.manualTotalPrice != null) {
        return {
          unitPrice: it.manualUnitPrice,
          totalPrice: it.manualTotalPrice,
          priceSource: 'manual' as PriceSource,
        };
      }
      return { unitPrice: null, totalPrice: null, priceSource: 'unknown' as PriceSource };
    });
  }

  // Manual-partial: allocate remaining to items without manual price
  if (strategy === 'manual_partial') {
    const manualSum = items.reduce(
      (s, it) => s + (it.manualTotalPrice ?? 0),
      0,
    );
    const remaining = round2(totalAmount - manualSum);
    const unpriced = items.filter((it) => it.manualTotalPrice == null);

    // Fallback: no unpriced items → everything manual (even if sum ≠ total)
    if (unpriced.length === 0) {
      return items.map((it) => ({
        unitPrice: it.manualUnitPrice,
        totalPrice: it.manualTotalPrice,
        priceSource: 'manual' as PriceSource,
      }));
    }

    // If remaining <= 0, unpriced items become unknown (no price to allocate)
    if (remaining <= 0) {
      return items.map((it) =>
        it.manualTotalPrice == null
          ? { unitPrice: null, totalPrice: null, priceSource: 'unknown' as PriceSource }
          : {
              unitPrice: it.manualUnitPrice,
              totalPrice: it.manualTotalPrice,
              priceSource: 'manual' as PriceSource,
            },
      );
    }

    // Distribute `remaining` among unpriced by by_quantity weights
    const weights = unpriced.map((it) => weightFor(it));
    const weightSum = weights.reduce((a, b) => a + b, 0) || unpriced.length;
    const unpricedShares = unpriced.map((_, idx) =>
      round2((remaining * weights[idx]) / weightSum),
    );
    // Adjust rounding drift
    const drift = round2(remaining - unpricedShares.reduce((a, b) => a + b, 0));
    const lastIdx = unpricedShares.length - 1;
    if (lastIdx >= 0) {
      unpricedShares[lastIdx] = round2((unpricedShares.at(-1) ?? 0) + drift);
    }

    let unpricedIdx = 0;
    return items.map((it) => {
      if (it.manualTotalPrice != null) {
        return {
          unitPrice: it.manualUnitPrice,
          totalPrice: it.manualTotalPrice,
          priceSource: 'manual' as PriceSource,
        };
      }
      const share = unpricedShares[unpricedIdx];
      unpricedIdx += 1;
      const unit = it.quantity > 0 ? round2(share / it.quantity) : 0;
      return {
        unitPrice: unit,
        totalPrice: share,
        priceSource: 'allocated' as PriceSource,
      };
    });
  }

  // Equal split across all items
  if (strategy === 'equal') {
    const perItem = round2(totalAmount / n);
    const shares = new Array<number>(n).fill(perItem);
    const drift = round2(totalAmount - perItem * n);
    shares[n - 1] = round2(shares[n - 1] + drift);
    return items.map((it, i) => ({
      unitPrice: it.quantity > 0 ? round2(shares[i] / it.quantity) : 0,
      totalPrice: shares[i],
      priceSource: 'allocated' as PriceSource,
    }));
  }

  // by_quantity (default fallback)
  const weights = items.map((it) => weightFor(it));
  const weightSum = weights.reduce((a, b) => a + b, 0) || n;
  const shares = items.map((_, i) => round2((totalAmount * weights[i]) / weightSum));
  const drift = round2(totalAmount - shares.reduce((a, b) => a + b, 0));
  shares[shares.length - 1] = round2((shares.at(-1) ?? 0) + drift);
  return items.map((it, i) => ({
    unitPrice: it.quantity > 0 ? round2(shares[i] / it.quantity) : 0,
    totalPrice: shares[i],
    priceSource: 'allocated' as PriceSource,
  }));
}

function weightFor(it: ResolvedItem): number {
  const unit = it.product.lastPurchasePrice ?? it.product.avgPrice ?? 1;
  return Math.max(0.01, it.quantity * unit);
}

