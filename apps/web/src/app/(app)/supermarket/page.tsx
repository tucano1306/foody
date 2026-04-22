import { api } from '@/lib/api';
import SupermarketView from '@/components/shopping/SupermarketView';
import ModeToggle from '@/components/layout/ModeToggle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Supermercado' };

export default async function SupermarketPage() {
  const items = await api.shoppingList.get();

  return (
    <div className="space-y-6">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-market-600 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              🛒 Modo Supermercado
            </h1>
            <p className="mt-1 text-market-100">
              {items.length} producto{items.length !== 1 ? 's' : ''} para comprar
            </p>
          </div>
          <ModeToggle currentMode="supermarket" />
        </div>
      </div>

      {/* ─── Shopping list ──────────────────────────────────────────────────── */}
      <SupermarketView initialItems={items} />
    </div>
  );
}
