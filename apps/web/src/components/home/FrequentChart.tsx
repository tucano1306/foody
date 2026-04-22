'use client';

import StatsBars from './StatsBars';

interface Item {
  readonly productId: string;
  readonly name: string;
  readonly purchases: number;
  readonly lastPurchasedAt: string;
}

interface Props {
  readonly items: readonly Item[];
}

function formatRelative(iso: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays}d`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)}sem`;
  return `hace ${Math.floor(diffDays / 30)}m`;
}

export default function FrequentChart({ items }: Readonly<Props>) {
  const data = items.map((i) => ({
    label: i.name,
    value: i.purchases,
    sublabel: formatRelative(i.lastPurchasedAt),
  }));

  return <StatsBars data={data} unit="x" />;
}
