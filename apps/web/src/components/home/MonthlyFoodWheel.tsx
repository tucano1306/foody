import { api } from '@/lib/api';
import MonthlyFoodChart from './MonthlyFoodChart';

function getMonthName(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString('es-MX', { month: 'long' });
}

export default async function MonthlyFoodWheel() {
  let data: { currentTotal: number; previousTotal: number } = { currentTotal: 0, previousTotal: 0 };
  try {
    data = await api.shoppingList.monthlyFoodSpending();
  } catch {
    // Silently ignore
  }

  if (data.currentTotal === 0 && data.previousTotal === 0) return null;

  const currentMonthName = getMonthName(0);
  const prevMonthName = getMonthName(-1);

  return (
    <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
          📊 Gasto en comida
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Comparativa mes actual vs anterior
        </p>
      </div>
      <MonthlyFoodChart
        currentTotal={data.currentTotal}
        previousTotal={data.previousTotal}
        currentMonthName={currentMonthName}
        prevMonthName={prevMonthName}
      />
    </section>
  );
}
