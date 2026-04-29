import Link from 'next/link';
import { api } from '@/lib/api';
import ModernTitle from '@/components/layout/ModernTitle';

function formatMoney(value: number): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface PriceEntry {
  productId: string;
  productName: string;
  storeName: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  purchaseCount: number;
  lastSeenAt: string;
}

interface ProductGroup {
  productId: string;
  productName: string;
  entries: PriceEntry[];
  cheapest: PriceEntry;
  priceDiff: number;
}

function getStoreEmoji(isCheapest: boolean, isMostExpensive: boolean): string {
  if (isCheapest) return '✅';
  if (isMostExpensive) return '🔴';
  return '🔵';
}

function getPriceColor(isCheapest: boolean, isMostExpensive: boolean): string {
  if (isCheapest) return 'text-emerald-700';
  if (isMostExpensive) return 'text-rose-600';
  return 'text-stone-700';
}

function groupByProduct(rows: PriceEntry[]): ProductGroup[] {
  const map = new Map<string, PriceEntry[]>();
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push(row);
    map.set(row.productId, list);
  }

  const groups: ProductGroup[] = [];
  for (const [productId, entries] of map) {
    const sorted = [...entries].sort((a, b) => a.minPrice - b.minPrice);
    const cheapest = sorted[0];
    const mostExpensive = sorted.at(-1)!;
    const priceDiff = mostExpensive.minPrice - cheapest.minPrice;
    groups.push({ productId, productName: entries[0].productName, entries: sorted, cheapest, priceDiff });
  }

  return groups.sort((a, b) => b.priceDiff - a.priceDiff);
}

export default async function PriceComparisonPage() {
  let rows: PriceEntry[] = [];
  try {
    rows = await api.shoppingTrips.priceComparison();
  } catch {
    rows = [];
  }

  const groups = groupByProduct(rows);

  return (
    <div className="space-y-4">
      <ModernTitle
        title="📊 Comparar precios"
        subtitle="Mismo producto, distintos supermercados — ve dónde sale más barato."
        action={
          <Link href="/shopping-trips" className="text-sm text-stone-500 hover:text-stone-700 font-medium">
            ← Mis compras
          </Link>
        }
      />

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center">
          <p className="text-5xl mb-3">📊</p>
          <p className="text-stone-700 font-semibold">Sin datos de comparación aún</p>
          <p className="text-sm text-stone-500 mt-1">
            Completa algunas compras en distintos supermercados y Foody comparará precios automáticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.productId} className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
              {/* Product header */}
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-3">
                <p className="font-bold text-stone-800">{group.productName}</p>
                {group.entries.length > 1 && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                    Ahorras {formatMoney(group.priceDiff)} comprando en {group.cheapest.storeName}
                  </span>
                )}
              </div>

              {/* Store rows */}
              <ul>
                {group.entries.map((entry, idx) => {
                  const isCheapest = idx === 0 && group.entries.length > 1;
                  const isMostExpensive = idx === group.entries.length - 1 && group.entries.length > 1;
                  return (
                    <li
                      key={`${entry.productId}-${entry.storeName}`}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0 ${isCheapest ? 'bg-emerald-50/60' : ''}`}
                    >
                      <span className="text-lg w-6 shrink-0">
                        {getStoreEmoji(isCheapest, isMostExpensive)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-800 truncate">{entry.storeName}</p>
                        <p className="text-[11px] text-stone-400">
                          {entry.purchaseCount} {entry.purchaseCount === 1 ? 'compra' : 'compras'} · último {formatDate(entry.lastSeenAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-lg ${getPriceColor(isCheapest, isMostExpensive)}`}>
                          {formatMoney(entry.minPrice)}
                        </p>
                        {entry.minPrice !== entry.maxPrice && (
                          <p className="text-[11px] text-stone-400">
                            hasta {formatMoney(entry.maxPrice)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
