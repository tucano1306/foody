'use client';

import StatsWheel from './StatsWheel';

interface Slice {
  readonly storeName: string;
  readonly total: number;
  readonly count: number;
}

interface Props {
  readonly data: readonly Slice[];
}

export default function StoreVisitsChart({ data }: Readonly<Props>) {
  const totalVisits = data.reduce((sum, d) => sum + d.count, 0);
  if (totalVisits === 0) return null;

  const sorted = [...data].sort((a, b) => b.count - a.count);
  const wheelData = sorted.map((d) => ({
    label: d.storeName,
    value: d.count,
    sublabel: `${d.count} ${d.count === 1 ? 'visita' : 'visitas'}`,
  }));

  return (
    <StatsWheel
      data={wheelData}
      totalLabel="Visitas"
      totalValue={String(totalVisits)}
      formatValue={(v) => `${v} ${v === 1 ? 'vez' : 'veces'}`}
    />
  );
}
