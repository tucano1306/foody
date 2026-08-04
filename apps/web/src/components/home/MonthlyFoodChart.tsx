interface Props {
  readonly currentTotal: number;
  readonly previousTotal: number;
  readonly currentMonthName: string;
  readonly prevMonthName: string;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

interface Delta {
  readonly badge: string;
  readonly badgeCls: string;
  readonly takeaway: string;
}

function buildDelta(current: number, previous: number, prevMonthName: string): Delta | null {
  if (previous <= 0) {
    return {
      badge: 'Nuevo',
      badgeCls: 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400',
      takeaway: 'Es tu primer mes con gasto registrado.',
    };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const diff = Math.abs(current - previous);
  if (current < previous) {
    return {
      badge: `↓ ${Math.abs(pct)}%`,
      badgeCls: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
      takeaway: `Llevas ${formatMoney(diff)} menos que en ${prevMonthName} 🎉`,
    };
  }
  if (current > previous) {
    return {
      badge: `↑ ${pct}%`,
      badgeCls: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
      takeaway: `Llevas ${formatMoney(diff)} más que en ${prevMonthName}.`,
    };
  }
  return {
    badge: '= igual',
    badgeCls: 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400',
    takeaway: `Vas igual que en ${prevMonthName}.`,
  };
}

function CompareBar({
  label,
  value,
  max,
  highlighted,
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly highlighted: boolean;
}) {
  const pct = Math.max(3, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 capitalize">{label}</span>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">{formatMoney(value)}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${highlighted ? 'bg-brand-500' : 'bg-slate-300 dark:bg-white/25'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MonthlyFoodChart({ currentTotal, previousTotal, currentMonthName, prevMonthName }: Readonly<Props>) {
  if (currentTotal <= 0 && previousTotal <= 0) return null;
  const max = Math.max(currentTotal, previousTotal, 1);
  const delta = buildDelta(currentTotal, previousTotal, prevMonthName);

  return (
    <div>
      {/* Headline: this month's total + change badge */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">
            {formatMoney(currentTotal)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            en <span className="capitalize font-medium">{currentMonthName}</span>
          </p>
        </div>
        {delta && (
          <span className={`shrink-0 text-sm font-bold px-2.5 py-1 rounded-full tabular-nums ${delta.badgeCls}`}>
            {delta.badge}
          </span>
        )}
      </div>

      {/* Side-by-side comparison bars */}
      <div className="mt-4 space-y-3">
        <CompareBar label={currentMonthName} value={currentTotal} max={max} highlighted />
        <CompareBar label={prevMonthName} value={previousTotal} max={max} highlighted={false} />
      </div>

      {/* Plain-language takeaway */}
      {delta && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-2">
          {delta.takeaway}
        </p>
      )}
    </div>
  );
}
