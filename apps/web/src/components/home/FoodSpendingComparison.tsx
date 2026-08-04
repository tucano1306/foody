import { api } from '@/lib/api';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getMonthName(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString('es-MX', { month: 'long' });
}

function getTrendCls(isDown: boolean, isUp: boolean): string {
  if (isDown) return 'bg-sky-50 text-sky-700 border border-sky-100';
  if (isUp) return 'bg-blue-50 text-blue-700 border border-blue-100';
  return 'bg-slate-50 text-slate-600 border border-slate-100';
}

function getTrendEmoji(isDown: boolean, isUp: boolean): string {
  if (isDown) return '📉';
  if (isUp) return '📈';
  return '➡️';
}

function getTrendText(isDown: boolean, isUp: boolean, pct: number): string {
  if (isDown) return `Gastaste ${Math.abs(pct)}% menos que el mes pasado`;
  if (isUp) return `Gastaste ${pct}% más que el mes pasado`;
  return 'Igual que el mes pasado';
}

export default async function FoodSpendingComparison() {
  let data: { currentTotal: number; previousTotal: number } = { currentTotal: 0, previousTotal: 0 };
  try {
    data = await api.shoppingList.monthlyFoodSpending();
  } catch {
    // Silently ignore
  }

  if (data.currentTotal === 0 && data.previousTotal === 0) return null;

  const { currentTotal, previousTotal } = data;
  const currentMonthName = getMonthName(0);
  const prevMonthName = getMonthName(-1);

  const diff = currentTotal - previousTotal;
  const pct = previousTotal > 0 ? Math.round((diff / previousTotal) * 100) : null;
  const isUp = diff > 0;
  const isDown = diff < 0;

  return (
    <section className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          📊 Gastos de comida
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">Mes actual vs anterior</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-[10px] text-slate-400 capitalize tracking-wide">{currentMonthName}</p>
          <p className="text-xl font-bold text-slate-900 mt-1 leading-none">{formatMoney(currentTotal)}</p>
          <p className="text-[10px] text-slate-400 mt-1">este mes</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-[10px] text-slate-400 capitalize tracking-wide">{prevMonthName}</p>
          <p className="text-xl font-bold text-slate-500 mt-1 leading-none">{formatMoney(previousTotal)}</p>
          <p className="text-[10px] text-slate-400 mt-1">mes anterior</p>
        </div>
      </div>

      {pct !== null && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${getTrendCls(isDown, isUp)}`}>
          <span className="text-lg leading-none">{getTrendEmoji(isDown, isUp)}</span>
          <span>{getTrendText(isDown, isUp, pct)}</span>
        </div>
      )}
    </section>
  );
}
