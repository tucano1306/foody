import { api } from '@/lib/api';
import FrequentChart from './FrequentChart';
import ChartCard from './ChartCard';

export default async function FrequentProducts() {
  let items: Awaited<ReturnType<typeof api.shoppingList.frequent>> = [];
  try {
    items = await api.shoppingList.frequent();
  } catch {
    // Silently ignore if endpoint not reachable
  }

  if (items.length === 0) return null;

  const top = items.slice(0, 5);

  return (
    <ChartCard title="Más comprados">
      <FrequentChart items={top} />
    </ChartCard>
  );
}
