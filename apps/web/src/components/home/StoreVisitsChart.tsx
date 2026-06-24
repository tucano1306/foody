import StoreRankList, { type StoreDatum } from './StoreRankList';

interface Props {
  readonly data: readonly StoreDatum[];
}

export default function StoreVisitsChart({ data }: Readonly<Props>) {
  const totalVisits = data.reduce((sum, d) => sum + d.count, 0);
  if (totalVisits === 0) return null;
  return <StoreRankList data={data} metric="visits" />;
}
