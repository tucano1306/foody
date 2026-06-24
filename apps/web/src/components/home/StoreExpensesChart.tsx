import StoreRankList, { type StoreDatum } from './StoreRankList';

interface Props {
  readonly data: readonly StoreDatum[];
}

export default function StoreExpensesChart({ data }: Readonly<Props>) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  if (total === 0) return null;
  return <StoreRankList data={data} metric="spend" />;
}
