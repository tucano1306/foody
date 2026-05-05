import { api } from '@/lib/api';
import MonthlyFoodChart from './MonthlyFoodChart';

function getMonthName(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString('es-MX', { month: 'long' });
}

function EmptyState({ purchaseCount }: { readonly purchaseCount: number }) {
  if (purchaseCount > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <span className="text-5xl mb-3">🏷️</span>
        <p className="text-sm font-medium text-stone-500">
          {purchaseCount} {purchaseCount === 1 ? 'compra registrada' : 'compras registradas'} sin precio
        </p>
        <p className="text-xs text-stone-400 mt-1 text-center max-w-55">
          Ingresa el monto total al completar tu próxima compra para ver el gasto
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-10 text-stone-300">
      <span className="text-5xl mb-3">📊</span>
      <p className="text-sm font-medium text-stone-400">Sin compras registradas</p>
      <p className="text-xs text-stone-300 mt-1">Registra compras de productos para ver el gasto</p>
    </div>
  );
}

export default async function MonthlyFoodWheel() {
  let data: { currentTotal: number; previousTotal: number; purchaseCount: number } = {
    currentTotal: 0,
    previousTotal: 0,
    purchaseCount: 0,
  };
  try {
    data = await api.shoppingList.monthlyFoodSpending();
  } catch {
    // Silently ignore
  }

  const hasSpending = data.currentTotal > 0 || data.previousTotal > 0;
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
      {hasSpending ? (
        <MonthlyFoodChart
          currentTotal={data.currentTotal}
          previousTotal={data.previousTotal}
          currentMonthName={currentMonthName}
          prevMonthName={prevMonthName}
        />
      ) : (
        <EmptyState purchaseCount={data.purchaseCount} />
      )}
    </section>
  );
}
