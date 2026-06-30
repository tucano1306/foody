import Image from 'next/image';
import { getStoreLogo } from '@/lib/store-logo';

export interface StoreDatum {
  readonly storeName: string;
  readonly total: number;
  readonly count: number;
}

interface Props {
  readonly data: readonly StoreDatum[];
  /** Which number to rank and highlight: number of visits, or money spent. */
  readonly metric: 'visits' | 'spend';
  readonly maxRows?: number;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function visitsLabel(count: number): string {
  return `${count} ${count === 1 ? 'visita' : 'visitas'}`;
}

function purchasesLabel(count: number): string {
  return `${count} ${count === 1 ? 'compra' : 'compras'}`;
}

/**
 * A ranked list of supermarkets shown as horizontal bars — far easier to compare
 * at a glance than a donut. Works for both "most visited" (metric="visits") and
 * "most spent" (metric="spend"); the leader is highlighted with a crown.
 */
export default function StoreRankList({ data, metric, maxRows = 5 }: Props) {
  const valueOf = (d: StoreDatum) => (metric === 'visits' ? d.count : d.total);
  const sorted = [...data].sort((a, b) => valueOf(b) - valueOf(a));
  const rows = sorted.slice(0, maxRows);
  const hidden = sorted.length - rows.length;
  const grandTotal = sorted.reduce((sum, d) => sum + valueOf(d), 0) || 1;
  const max = valueOf(rows[0]) || 1;

  const barColor = metric === 'visits' ? 'bg-sky-400' : 'bg-emerald-400';
  const leaderRing =
    metric === 'visits'
      ? 'border-sky-200 dark:border-sky-500/40 bg-sky-50/70 dark:bg-sky-500/10'
      : 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/10';

  const primary = (d: StoreDatum) => (metric === 'visits' ? visitsLabel(d.count) : formatMoney(d.total));
  const secondary = (d: StoreDatum) =>
    metric === 'visits' ? `${formatMoney(d.total)} gastados` : purchasesLabel(d.count);

  return (
    <div className="space-y-2.5">
      {rows.map((d, i) => {
        const value = valueOf(d);
        const sharePct = Math.round((value / grandTotal) * 100);
        const barPct = Math.max(4, Math.round((value / max) * 100));
        const isLeader = i === 0;
        const logo = getStoreLogo(d.storeName);
        return (
          <div
            key={d.storeName}
            className={`rounded-2xl p-3 border transition-colors ${
              isLeader ? leaderRing : 'border-stone-100 dark:border-stone-800'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Logo / rank badge */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-xl bg-white border border-stone-100 flex items-center justify-center overflow-hidden">
                  {logo ? (
                    <Image src={logo} alt={d.storeName} width={40} height={40} className="object-contain w-full h-full" />
                  ) : (
                    <span className="text-lg" aria-hidden="true">🛒</span>
                  )}
                </div>
                <span
                  className={`absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shadow-sm ${
                    isLeader ? 'bg-amber-400 text-white' : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-200'
                  }`}
                >
                  {isLeader ? '👑' : i + 1}
                </span>
              </div>

              {/* Name + bar + numbers */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold text-stone-800 dark:text-stone-100 text-sm truncate">{d.storeName}</p>
                  <p className="font-extrabold text-stone-900 dark:text-white text-sm tabular-nums shrink-0">
                    {primary(d)}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-stone-100 dark:bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="w-9 text-right text-[11px] font-bold text-stone-500 dark:text-stone-400 tabular-nums shrink-0">
                    {sharePct}%
                  </span>
                </div>
                <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">{secondary(d)}</p>
              </div>
            </div>
          </div>
        );
      })}

      {hidden > 0 && (
        <p className="text-[11px] text-stone-400 dark:text-stone-500 text-center pt-0.5">
          +{hidden} {hidden === 1 ? 'tienda más' : 'tiendas más'}
        </p>
      )}
    </div>
  );
}
