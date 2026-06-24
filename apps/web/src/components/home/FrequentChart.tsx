'use client';

interface Item {
  readonly productId: string;
  readonly name: string;
  readonly purchases: number;
  readonly lastPurchasedAt: string;
}

interface Props {
  readonly items: readonly Item[];
}

function formatRelative(iso: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays}d`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)}sem`;
  return `hace ${Math.floor(diffDays / 30)}m`;
}

/** Light-to-deep blue palette (matches the rest of the dashboard). */
const BLUE_PALETTE: readonly string[] = [
  '#0284c7', // sky-600
  '#0ea5e9', // sky-500
  '#38bdf8', // sky-400
  '#7dd3fc', // sky-300
  '#bae6fd', // sky-200
];

/**
 * Compact horizontal bar list — takes far less vertical space than the
 * previous tall vertical bar chart, while still being touch-friendly.
 */
export default function FrequentChart({ items }: Readonly<Props>) {
  const max = Math.max(1, ...items.map((i) => i.purchases));

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => {
        const pct = Math.max(8, (item.purchases / max) * 100);
        const color = BLUE_PALETTE[i % BLUE_PALETTE.length];
        return (
          <li key={item.productId} className="flex items-center gap-3">
            {/* Label */}
            <span
              className="w-24 sm:w-32 shrink-0 text-xs font-medium text-stone-600 truncate"
              title={item.name}
            >
              {item.name}
            </span>

            {/* Bar track */}
            <div className="flex-1 h-5 rounded-full bg-stone-100 overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>

            {/* Count + recency */}
            <span className="shrink-0 text-right tabular-nums">
              <span className="text-sm font-bold text-stone-700">{item.purchases}x</span>
              <span className="block text-[10px] text-stone-400 leading-none">
                {formatRelative(item.lastPurchasedAt)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
