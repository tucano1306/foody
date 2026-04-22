'use client';

import StatsWheel from './StatsWheel';

const CATEGORY_LABELS: Record<string, string> = {
  utilities: 'Servicios',
  subscriptions: 'Suscripciones',
  rent: 'Renta',
  insurance: 'Seguros',
  internet: 'Internet',
  phone: 'Telefono',
  streaming: 'Streaming',
  other: 'Otros',
};

function labelFor(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

interface Slice {
  readonly category: string;
  readonly total: number;
  readonly count: number;
}

interface Props {
  readonly data: readonly Slice[];
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
}

export default function ExpensesChart({ data }: Readonly<Props>) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const wheelData = data.map((d) => ({ label: labelFor(d.category), value: d.total }));
  return (
    <StatsWheel data={wheelData} totalLabel="Total / mes" totalValue={formatMoney(total)} formatValue={formatMoney} />
  );
}