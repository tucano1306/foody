'use client';

import { useEffect, useRef, useState } from 'react';
import type { Store } from '@foody/types';

interface Props {
  readonly value: { storeId: string | null; storeName: string | null };
  readonly onChange: (next: { storeId: string | null; storeName: string | null }) => void;
  readonly placeholder?: string;
}

export default function StoreSelector(props: Readonly<Props>) {
  const { value, onChange, placeholder = 'Tienda (opcional)' } = props;
  const [stores, setStores] = useState<Store[]>([]);
  const [query, setQuery] = useState<string>(value.storeName ?? '');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void fetch('/api/proxy/stores', { credentials: 'include' })
      .then(async (r) => (r.ok ? ((await r.json()) as Store[]) : []))
      .then((list) => {
        if (alive) setStores(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? stores.filter((s) => s.name.toLowerCase().includes(q))
    : stores;
  const exactMatch = stores.some((s) => s.name.toLowerCase() === q);

  async function createStore(name: string) {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/proxy/stores', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const store = (await res.json()) as Store;
      setStores((prev) => [store, ...prev]);
      setQuery(store.name);
      onChange({ storeId: store.id, storeName: store.name });
      setOpen(false);
    } catch {
      // fall back to free-form name
      onChange({ storeId: null, storeName: name.trim() });
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:border-brand-500 focus:outline-none"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // keep free-form name in sync if user hasn't picked a store
          onChange({ storeId: null, storeName: e.target.value.trim() || null });
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-stone-200 bg-white shadow-lg max-h-64 overflow-auto">
          {filtered.length === 0 && !q && (
            <p className="px-3 py-2 text-xs text-stone-400">
              No tienes tiendas guardadas todavía.
            </p>
          )}
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 flex items-center gap-2"
              onClick={() => {
                setQuery(s.name);
                onChange({ storeId: s.id, storeName: s.name });
                setOpen(false);
              }}
            >
              <span>{s.icon ?? '🏪'}</span>
              <span className="font-medium text-stone-700">{s.name}</span>
              {s.chain && (
                <span className="ml-auto text-xs text-stone-400">{s.chain}</span>
              )}
            </button>
          ))}
          {q && !exactMatch && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 text-brand-700 font-medium border-t border-stone-100"
              disabled={creating}
              onClick={() => {
                void createStore(query);
              }}
            >
              + Crear tienda “{query}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
