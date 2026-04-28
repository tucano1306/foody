'use client';

import { useState } from 'react';
import ProductCard from '@/components/products/ProductCard';
import type { Product, StockLevel } from '@foody/types';

interface Props {
  readonly empty: Product[];
  readonly low: Product[];
}

function ProductGrid({ items, onLevelChange }: { readonly items: Product[]; readonly onLevelChange: (id: string, level: StockLevel) => void }) {
  if (items.length === 1) {
    return (
      <div className="flex justify-center">
        <div className="w-1/2 sm:w-1/3 md:w-1/4">
          <ProductCard product={items[0]} onLevelChange={onLevelChange} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} onLevelChange={onLevelChange} />
      ))}
    </div>
  );
}

export default function HomeProductSections({ empty: initialEmpty, low: initialLow }: Props) {
  const [empty, setEmpty] = useState(initialEmpty);
  const [low, setLow] = useState(initialLow);

  function handleLevelChange(id: string, newLevel: StockLevel) {
    if (newLevel === 'empty') {
      // Move from low → empty
      setLow((prev) => prev.filter((p) => p.id !== id));
      setEmpty((prev) => {
        if (prev.some((p) => p.id === id)) return prev;
        const moved = initialLow.find((p) => p.id === id) ?? initialEmpty.find((p) => p.id === id);
        return moved ? [...prev, { ...moved, stockLevel: 'empty' as StockLevel }] : prev;
      });
    } else if (newLevel === 'half') {
      // Move from empty → low
      setEmpty((prev) => prev.filter((p) => p.id !== id));
      setLow((prev) => {
        if (prev.some((p) => p.id === id)) return prev;
        const moved = initialEmpty.find((p) => p.id === id) ?? initialLow.find((p) => p.id === id);
        return moved ? [...prev, { ...moved, stockLevel: 'half' as StockLevel }] : prev;
      });
    } else {
      // full → remove from both lists immediately
      setEmpty((prev) => prev.filter((p) => p.id !== id));
      setLow((prev) => prev.filter((p) => p.id !== id));
    }
  }

  return (
    <>
      {empty.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-rose-700 mb-4 flex items-center gap-2">
            <span>🚨</span> Se acabó — prioridad ({empty.length})
          </h2>
          <ProductGrid items={empty} onLevelChange={handleLevelChange} />
        </section>
      )}

      {low.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-amber-700 mb-4 flex items-center gap-2">
            <span>⚠️</span> Queda poco ({low.length})
          </h2>
          <ProductGrid items={low} onLevelChange={handleLevelChange} />
        </section>
      )}
    </>
  );
}
