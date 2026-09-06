import { getStoresAggregate } from '@/lib/home-queries';
import StoreExpensesChart from './StoreExpensesChart';
import ChartCard from './ChartCard';

export default async function ExpensesByStore() {
  let data: Awaited<ReturnType<typeof getStoresAggregate>> = [];
  try {
    data = await getStoresAggregate();
  } catch {
    // Silently ignore
  }

  if (data.length === 0) return null;
  const total = data.reduce((sum, d) => sum + d.total, 0);
  if (total === 0) return null;

  return (
    <ChartCard title="Gasto por súper">
      <StoreExpensesChart data={data} />
    </ChartCard>
  );
}
