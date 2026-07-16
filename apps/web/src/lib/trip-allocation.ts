/**
 * trip-allocation.ts — price allocation for shopping-trip line items.
 * Shared by POST /api/shopping-trips (create) and PATCH /api/shopping-trips/[id]
 * (edit): route files may only export handlers, so the logic lives here.
 */
import type { AllocationStrategy, ShoppingTripItemDto } from '@foody/types';

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ResolvedItem {
  productId: string;
  quantity: number;
  manualUnitPrice: number | null;
  manualTotalPrice: number | null;
}

export interface Allocation {
  unitPrice: number | null;
  totalPrice: number | null;
  priceSource: string;
}

function normalizeManual(item: ShoppingTripItemDto): { unitPrice: number | null; totalPrice: number | null } {
  if (item.unitPrice == null && item.totalPrice == null) return { unitPrice: null, totalPrice: null };
  const unit = item.unitPrice == null
    ? round2((item.totalPrice ?? 0) / item.quantity)
    : round2(item.unitPrice);
  const total = item.totalPrice == null ? round2(unit * item.quantity) : round2(item.totalPrice);
  return { unitPrice: unit, totalPrice: total };
}

export function resolveItems(items: ShoppingTripItemDto[]): ResolvedItem[] {
  return items.map((item) => {
    const manual = normalizeManual(item);
    return {
      productId: item.productId,
      quantity: item.quantity,
      manualUnitPrice: manual.unitPrice,
      manualTotalPrice: manual.totalPrice,
    };
  });
}

function weightFor(it: ResolvedItem): number {
  return Math.max(0.01, it.quantity * (it.manualUnitPrice ?? 1));
}

export function allocate(items: ResolvedItem[], totalAmount: number, strategy: AllocationStrategy): Allocation[] {
  const n = items.length;
  if (n === 0) return [];

  if (strategy === 'none') {
    return items.map((it) =>
      it.manualUnitPrice != null && it.manualTotalPrice != null
        ? { unitPrice: it.manualUnitPrice, totalPrice: it.manualTotalPrice, priceSource: 'manual' }
        : { unitPrice: null, totalPrice: null, priceSource: 'unknown' },
    );
  }

  if (strategy === 'manual_partial') {
    const manualSum = items.reduce((s, it) => s + (it.manualTotalPrice ?? 0), 0);
    const remaining = round2(totalAmount - manualSum);
    const unpriced = items.filter((it) => it.manualTotalPrice == null);

    if (unpriced.length === 0) {
      return items.map((it) => ({
        unitPrice: it.manualUnitPrice,
        totalPrice: it.manualTotalPrice,
        priceSource: 'manual',
      }));
    }
    if (remaining <= 0) {
      return items.map((it) =>
        it.manualTotalPrice == null
          ? { unitPrice: null, totalPrice: null, priceSource: 'unknown' }
          : { unitPrice: it.manualUnitPrice, totalPrice: it.manualTotalPrice, priceSource: 'manual' },
      );
    }

    const weights = unpriced.map((it) => weightFor(it));
    const weightSum = weights.reduce((a, b) => a + b, 0) || unpriced.length;
    const shares = unpriced.map((_, i) => round2((remaining * weights[i]) / weightSum));
    const drift = round2(remaining - shares.reduce((a, b) => a + b, 0));
    shares[shares.length - 1] = round2((shares.at(-1) ?? 0) + drift);

    let unpricedIdx = 0;
    return items.map((it) => {
      if (it.manualTotalPrice != null) {
        return { unitPrice: it.manualUnitPrice, totalPrice: it.manualTotalPrice, priceSource: 'manual' };
      }
      const share = shares[unpricedIdx];
      unpricedIdx += 1;
      const unit = it.quantity > 0 ? round2(share / it.quantity) : 0;
      return { unitPrice: unit, totalPrice: share, priceSource: 'allocated' };
    });
  }

  if (strategy === 'equal') {
    const base = round2(totalAmount / n);
    const perItems = items.map(() => base);
    const drift = round2(totalAmount - perItems.reduce((a, b) => a + b, 0));
    perItems[perItems.length - 1] = round2((perItems.at(-1) ?? 0) + drift);
    return items.map((it, i) => {
      const share = perItems[i];
      return { unitPrice: it.quantity > 0 ? round2(share / it.quantity) : 0, totalPrice: share, priceSource: 'allocated' };
    });
  }

  // by_quantity
  const weights = items.map((it) => weightFor(it));
  const weightSum = weights.reduce((a, b) => a + b, 0) || n;
  const shares = items.map((_, i) => round2((totalAmount * weights[i]) / weightSum));
  const drift = round2(totalAmount - shares.reduce((a, b) => a + b, 0));
  shares[shares.length - 1] = round2((shares.at(-1) ?? 0) + drift);
  return items.map((it, i) => {
    const share = shares[i];
    return { unitPrice: it.quantity > 0 ? round2(share / it.quantity) : 0, totalPrice: share, priceSource: 'allocated' };
  });
}
