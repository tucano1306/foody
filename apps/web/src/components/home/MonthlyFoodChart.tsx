'use client';

import StatsWheel from './StatsWheel';

interface Props {
  readonly currentTotal: number;
  readonly previousTotal: number;
  readonly currentMonthName: string;
  readonly prevMonthName: string;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function MonthlyFoodChart({ currentTotal, previousTotal, currentMonthName, prevMonthName }: Readonly<Props>) {
  const wheelData = [
    {
      label: currentMonthName,
      value: currentTotal,
      sublabel: formatMoney(currentTotal),
    },
    {
      label: prevMonthName,
      value: previousTotal,
      sublabel: formatMoney(previousTotal),
    },
  ].filter((s) => s.value > 0);

  if (wheelData.length === 0) return null;

  return (
    <StatsWheel
      data={wheelData}
      totalLabel="Este mes"
      totalValue={formatMoney(currentTotal)}
      formatValue={formatMoney}
    />
  );
}
