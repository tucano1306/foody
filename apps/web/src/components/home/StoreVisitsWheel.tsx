import { getStoresAggregate } from '@/lib/home-queries';
import StoreVisitsChart from './StoreVisitsChart';
import ChartCard, { ChartEmpty } from './ChartCard';

export default async function StoreVisitsWheel() {
  let data: Awaited<ReturnType<typeof getStoresAggregate>> = [];
  try {
    data = await getStoresAggregate();
  } catch {
    // Silently ignore
  }

  const totalVisits = data.reduce((sum, d) => sum + d.count, 0);
  const hasData = data.length > 0 && totalVisits > 0;

  return (
    <ChartCard title="Súpers más visitados" zoomable={hasData}>
      {hasData ? (
        <StoreVisitsChart data={data} />
      ) : (
        <ChartEmpty emoji="🛒" message="Sin tickets registrados" />
      )}
    </ChartCard>
  );
}
