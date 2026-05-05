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

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
}

export default function StoreExpensesChart({ data }: Readonly<Props>) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  if (total === 0) return null;
  const wheelData = data.map((d) => ({
    label: d.storeName,
    value: d.total,
    sublabel: `${d.count} ${d.count === 1 ? 'compra' : 'compras'}`,
  }));
  return (
    <StatsWheel data={wheelData} totalLabel="Total" totalValue={formatMoney(total)} formatValue={formatMoney} />
  );
}