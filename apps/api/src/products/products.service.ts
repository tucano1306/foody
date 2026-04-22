import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { Product, StockLevel } from './product.entity';
import { ProductPurchase, PriceSource } from './product-purchase.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { Store } from '../stores/store.entity';
import { ShoppingListService } from '../shopping-list/shopping-list.service';
import { ScopeService } from '../common/scope.service';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ApplyPurchaseInput {
  readonly product: Product;
  readonly quantity: number;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly priceSource: PriceSource;
  readonly currency: string;
  readonly purchasedAt: Date;
  readonly storeId: string | null;
  readonly storeName: string | null;
  readonly tripId: string | null;
  readonly userId: string;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductPurchase)
    private readonly purchasesRepo: Repository<ProductPurchase>,
    private readonly shoppingListService: ShoppingListService,
    private readonly scopeService: ScopeService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(userId: string): Promise<Product[]> {
    const scope = await this.scopeService.resolve(userId);
    return this.productsRepo.find({
      where: this.scopeService.whereFragment(scope) as FindOptionsWhere<Product>,
      order: { name: 'ASC' },
    });
  }

  async findRunningLow(userId: string): Promise<Product[]> {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<Product>;
    return this.productsRepo.find({
      where: [
        { ...base, needsShopping: true },
        { ...base, isRunningLow: true },
      ],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Product> {
    const scope = await this.scopeService.resolve(userId);
    const product = await this.productsRepo.findOne({
      where: {
        ...(this.scopeService.whereFragment(scope) as FindOptionsWhere<Product>),
        id,
      },
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async create(userId: string, dto: CreateProductDto): Promise<Product> {
    const scope = await this.scopeService.resolve(userId);
    const product = this.productsRepo.create({
      ...dto,
      userId,
      householdId: scope.householdId,
    });
    const saved = await this.productsRepo.save(product);

    if (saved.needsShopping || saved.isRunningLow) {
      await this.shoppingListService.addToList(userId, saved.id);
    }

    return saved;
  }

  async update(id: string, userId: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id, userId);
    Object.assign(product, dto);
    const saved = await this.productsRepo.save(product);

    if (saved.needsShopping || saved.isRunningLow) {
      await this.shoppingListService.addToList(userId, saved.id);
    } else {
      await this.shoppingListService.removeFromListByProduct(userId, saved.id);
    }

    return saved;
  }

  async markRunningLow(id: string, userId: string): Promise<Product> {
    const product = await this.findOne(id, userId);
    product.stockLevel = 'half';
    product.isRunningLow = true;
    product.needsShopping = true;
    const saved = await this.productsRepo.save(product);
    await this.shoppingListService.addToList(userId, saved.id);
    return saved;
  }

  async markOk(id: string, userId: string): Promise<Product> {
    const product = await this.findOne(id, userId);
    product.stockLevel = 'full';
    product.isRunningLow = false;
    product.needsShopping = false;
    const saved = await this.productsRepo.save(product);
    await this.shoppingListService.removeFromListByProduct(userId, saved.id);
    return saved;
  }

  async setStockLevel(
    id: string,
    userId: string,
    level: StockLevel,
  ): Promise<Product> {
    const product = await this.findOne(id, userId);
    product.stockLevel = level;
    const saved = await this.productsRepo.save(product);

    if (level === 'full') {
      await this.shoppingListService.removeFromListByProduct(userId, saved.id);
    } else {
      await this.shoppingListService.addToList(userId, saved.id);
    }

    return saved;
  }

  async remove(id: string, userId: string): Promise<void> {
    const product = await this.findOne(id, userId);
    await this.productsRepo.remove(product);
  }

  async getPresignedUploadUrl(
    userId: string,
    fileName: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    // Delegated to StorageService — injected via the module
    throw new Error('Use StorageService.getPresignedUploadUrl()');
  }

  async countStats(userId: string) {
    const scope = await this.scopeService.resolve(userId);
    const base = this.scopeService.whereFragment(scope) as FindOptionsWhere<Product>;
    const total = await this.productsRepo.count({ where: base });
    const runningLow = await this.productsRepo.count({
      where: [
        { ...base, isRunningLow: true },
        { ...base, needsShopping: true },
      ],
    });
    return { total, runningLow };
  }

  // ─── Purchases ───────────────────────────────────────────────────────────

  /**
   * Shared helper: apply a purchase to a product inside a transaction.
   * Handles aggregate recomputation (stock, totalSpent, avgPrice from MANUAL only, last price).
   */
  async applyPurchase(
    manager: EntityManager,
    input: ApplyPurchaseInput,
  ): Promise<{ product: Product; purchase: ProductPurchase }> {
    const {
      product,
      quantity,
      unitPrice,
      totalPrice,
      priceSource,
      currency,
      purchasedAt,
      storeId,
      storeName,
      tripId,
      userId,
    } = input;

    const purchase = manager.create(ProductPurchase, {
      productId: product.id,
      quantity,
      unitPrice,
      totalPrice,
      priceSource,
      currency,
      purchasedAt,
      storeId,
      storeName,
      tripId,
      userId,
      householdId: product.householdId,
    });
    const savedPurchase = await manager.save(purchase);

    const newCurrentQty = round2(product.currentQuantity + quantity);
    const newTotalQty = round2(product.totalPurchasedQty + quantity);
    const spentDelta = totalPrice ?? 0;
    const newTotalSpent = round2(product.totalSpent + spentDelta);

    // avgPrice is recomputed ONLY from manual purchases to avoid polluting
    // the price signal with estimated/allocated values.
    const manualAgg = await manager
      .createQueryBuilder(ProductPurchase, 'pp')
      .select('COALESCE(SUM(pp.total_price), 0)', 'sum')
      .addSelect('COALESCE(SUM(pp.quantity), 0)', 'qty')
      .where('pp.product_id = :pid', { pid: product.id })
      .andWhere("pp.price_source = 'manual'")
      .getRawOne<{ sum: string; qty: string }>();
    const manualSum = Number.parseFloat(manualAgg?.sum ?? '0');
    const manualQty = Number.parseFloat(manualAgg?.qty ?? '0');
    const newAvg = manualQty > 0 ? round2(manualSum / manualQty) : null;

    product.currentQuantity = newCurrentQty;
    product.stockLevel = 'full';
    product.isRunningLow = false;
    product.needsShopping = false;
    if (unitPrice != null) {
      product.lastPurchasePrice = unitPrice;
    }
    product.lastPurchaseDate = savedPurchase.purchasedAt;
    product.totalPurchasedQty = newTotalQty;
    product.totalSpent = newTotalSpent;
    product.avgPrice = newAvg;
    product.currency = currency;

    const savedProduct = await manager.save(product);
    await this.shoppingListService.removeFromListByProduct(userId, savedProduct.id);

    return { product: savedProduct, purchase: savedPurchase };
  }

  async registerPurchase(
    productId: string,
    userId: string,
    dto: CreatePurchaseDto,
  ): Promise<{ product: Product; purchase: ProductPurchase }> {
    if (dto.unitPrice == null && dto.totalPrice == null) {
      throw new BadRequestException('unitPrice or totalPrice is required');
    }

    const qty = dto.quantity;
    const unitPrice =
      dto.unitPrice == null
        ? round2((dto.totalPrice as number) / qty)
        : round2(dto.unitPrice);
    const totalPrice =
      dto.totalPrice == null ? round2(unitPrice * qty) : round2(dto.totalPrice);

    return this.dataSource.transaction(async (manager) => {
      const product = await this.findOne(productId, userId);

      // Resolve store
      let storeId: string | null = null;
      let storeName: string | null = dto.storeName ?? null;
      if (dto.storeId) {
        const store = await manager.findOne(Store, { where: { id: dto.storeId } });
        if (store) {
          storeId = store.id;
          storeName = store.name;
        }
      }

      return this.applyPurchase(manager, {
        product,
        quantity: qty,
        unitPrice,
        totalPrice,
        priceSource: 'manual',
        currency: dto.currency ?? product.currency ?? 'MXN',
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : new Date(),
        storeId,
        storeName,
        tripId: null,
        userId,
      });
    });
  }

  async listPurchases(productId: string, userId: string): Promise<ProductPurchase[]> {
    await this.findOne(productId, userId); // scope check
    return this.purchasesRepo.find({
      where: { productId },
      order: { purchasedAt: 'DESC' },
    });
  }

  async deletePurchase(
    productId: string,
    purchaseId: string,
    userId: string,
  ): Promise<Product> {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.findOne(productId, userId);
      const purchase = await manager.findOne(ProductPurchase, {
        where: { id: purchaseId, productId },
      });
      if (!purchase) throw new NotFoundException(`Purchase ${purchaseId} not found`);

      await manager.remove(purchase);

      const newTotalQty = Math.max(
        0,
        round2(product.totalPurchasedQty - purchase.quantity),
      );
      const newTotalSpent = Math.max(
        0,
        round2(product.totalSpent - (purchase.totalPrice ?? 0)),
      );

      // Recompute avgPrice from remaining manual purchases
      const manualAgg = await manager
        .createQueryBuilder(ProductPurchase, 'pp')
        .select('COALESCE(SUM(pp.total_price), 0)', 'sum')
        .addSelect('COALESCE(SUM(pp.quantity), 0)', 'qty')
        .where('pp.product_id = :pid', { pid: product.id })
        .andWhere("pp.price_source = 'manual'")
        .getRawOne<{ sum: string; qty: string }>();
      const manualSum = Number.parseFloat(manualAgg?.sum ?? '0');
      const manualQty = Number.parseFloat(manualAgg?.qty ?? '0');
      const newAvg = manualQty > 0 ? round2(manualSum / manualQty) : null;

      product.totalPurchasedQty = newTotalQty;
      product.totalSpent = newTotalSpent;
      product.avgPrice = newAvg;

      // Refresh last purchase from remaining history
      const latest = await manager.findOne(ProductPurchase, {
        where: { productId },
        order: { purchasedAt: 'DESC' },
      });
      product.lastPurchasePrice = latest?.unitPrice ?? null;
      product.lastPurchaseDate = latest?.purchasedAt ?? null;

      return manager.save(product);
    });
  }
}
