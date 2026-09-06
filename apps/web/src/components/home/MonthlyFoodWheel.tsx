import { api } from '@/lib/api';
import MonthlyFoodChart from './MonthlyFoodChart';
import ChartCard, { ChartEmpty } from './ChartCard';

function getMonthName(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString('es-MX', { month: 'long' });
}

function EmptyState({ purchaseCount }: { readonly purchaseCount: number }) {
  // Dos mensajes distintos porque son dos situaciones distintas: o no hay
  // compras, o las hay pero sin importe. Una línea cada uno; el párrafo de
  // instrucciones que había debajo repetía lo mismo con más palabras.
  return (
    <ChartEmpty
      emoji={purchaseCount > 0 ? '🏷️' : '📊'}
      message={
        purchaseCount > 0
          ? `${purchaseCount} ${purchaseCount === 1 ? 'compra' : 'compras'} sin importe`
          : 'Sin compras registradas'
      }
    />
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
    <ChartCard title="Gasto en comida" zoomable={hasSpending}>
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
    </ChartCard>
  );
}
