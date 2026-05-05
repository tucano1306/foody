import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceCache } from './price-cache.entity';
import { CachePriceDto } from './dto/cache-price.dto';
import { Product } from '../products/product.entity';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PriceComparison {
  product: string;
  productId: string;
  walmart: number | null;
  publix: number | null;
  cheapest: 'walmart' | 'publix' | null;
  difference: number | null;
  currency: string;
}

@Injectable()
export class PricesService {
  constructor(
    @InjectRepository(PriceCache)
    private readonly cachRepo: Repository<PriceCache>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async compare(productId: string, userId: string): Promise<PriceComparison> {
    const product = await this.productRepo.findOne({
      where: { id: productId, userId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const now = Date.now();
    const cutoff = new Date(now - CACHE_TTL_MS);

    const rows = await this.cachRepo
      .createQueryBuilder('pc')
      .where('pc.productId = :productId', { productId })
      .andWhere('pc.updatedAt > :cutoff', { cutoff })
      .getMany();

    const byStore = new Map(rows.map((r) => [r.supermarket, r.price]));

    const walmart = byStore.get('walmart') ?? null;
    const publix = byStore.get('publix') ?? null;

    let cheapest: 'walmart' | 'publix' | null = null;
    let difference: number | null = null;

    if (walmart !== null && publix !== null) {
      cheapest = walmart <= publix ? 'walmart' : 'publix';
      difference = Math.abs(walmart - publix);
    } else if (walmart !== null) {
      cheapest = 'walmart';
    } else if (publix !== null) {
      cheapest = 'publix';
    }

    return {
      product: product.name,
      productId: product.id,
      walmart,
      publix,
      cheapest,
      difference: difference === null ? null : Math.round(difference * 100) / 100,
      currency: rows.at(0)?.currency ?? 'MXN',
    };
  }

  async upsertCache(dto: CachePriceDto): Promise<PriceCache> {
    const existing = await this.cachRepo.findOne({
      where: { productId: dto.productId, supermarket: dto.supermarket },
    });

    if (existing) {
      existing.price = dto.price;
      existing.currency = dto.currency;
      return this.cachRepo.save(existing);
    }

    return this.cachRepo.save(
      this.cachRepo.create({
        productId: dto.productId,
        supermarket: dto.supermarket,
        price: dto.price,
        currency: dto.currency,
      }),
    );
  }
}
