import { api } from '@/lib/api';
import SupermarketView from '@/components/shopping/SupermarketView';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Supermercado' };

export default async function SupermarketPage() {
  const items = await api.shoppingList.get();

  return (
    <div className="space-y-6">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-brand-700 text-white rounded-2xl p-5 sm:p-6 shadow-lg">
        <ModernTitle
          title="🛒 Modo Supermercado"
          subtitle={`${items.length} producto${items.length === 1 ? '' : 's'} para comprar`}
          onDark
          action={<ModeToggle currentMode="supermarket" onDark />}
        />
      </div>

      {/* ─── Shopping list ──────────────────────────────────────────────────── */}
      <SupermarketView initialItems={items} />
    </div>
  );
}
