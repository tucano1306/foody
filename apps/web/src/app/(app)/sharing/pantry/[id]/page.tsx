import { getSession } from '@/lib/session';
import { redirect, notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';
import ModernTitle from '@/components/layout/ModernTitle';
import CloneProductButton from '@/components/sharing/CloneProductButton';
import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Despensa compartida — Foody' };

interface Product {
  id: string; name: string; description: string | null; photo_url: string | null;
  category: string | null; stock_level: string; unit: string | null;
  current_quantity: number | null; min_quantity: number | null;
}

const STOCK_CONFIG = {
  full:  { dot: 'bg-emerald-500', label: 'Completo' },
  half:  { dot: 'bg-amber-500',   label: 'Bajo' },
  empty: { dot: 'bg-rose-500',    label: 'Vacío' },
};

export default async function SharedPantryPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const { id } = await params;
  await ensureSharingSchema();

  // Validate access
  const shares = await sql`
    SELECT ps.owner_id, u.name AS owner_name, u.email AS owner_email, u.avatar_url AS owner_avatar
    FROM pantry_shares ps
    JOIN users u ON u.id = ps.owner_id
    WHERE ps.id = ${id} AND ps.guest_id = ${session.userId} AND ps.status = 'accepted'
    LIMIT 1
  `;
  if (!shares.length) notFound();

  const owner = shares[0] as { owner_id: string; owner_name: string | null; owner_email: string; owner_avatar: string | null };

  const products = await sql`
    SELECT id, name, description, photo_url, category, stock_level, unit,
           current_quantity, min_quantity
    FROM products
    WHERE user_id = ${owner.owner_id}
    ORDER BY name ASC
  ` as Product[];

  const ownerLabel = owner.owner_name ?? owner.owner_email;

  return (
    <div className="space-y-6">
      <ModernTitle
        title={`🏠 Despensa de ${ownerLabel}`}
        subtitle="Vista de solo lectura — puedes clonar productos a tu despensa"
      />

      {/* Owner card */}
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        {owner.owner_avatar ? (
          <Image src={owner.owner_avatar} alt={ownerLabel} width={48} height={48} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
            {ownerLabel.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-semibold text-gray-800">{ownerLabel}</p>
          <p className="text-xs text-gray-400">{products.length} productos en su despensa</p>
        </div>
      </div>

      {/* Products grid */}
      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-2">📦</div>
          <p>Esta despensa está vacía</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => {
            const lvl = (p.stock_level ?? 'full') as keyof typeof STOCK_CONFIG;
            const cfg = STOCK_CONFIG[lvl] ?? STOCK_CONFIG.full;
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition">
                <div className="aspect-4/3 bg-stone-50 relative overflow-hidden">
                  {p.photo_url ? (
                    <Image src={p.photo_url} alt={p.name} fill className="object-cover" sizes="25vw" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl opacity-40">🥑</div>
                  )}
                  <span className="absolute top-2 right-2 flex items-center gap-1 bg-white/95 rounded-full px-2 py-0.5 text-[10px] font-bold text-gray-700 shadow-sm">
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                  {p.category && <p className="text-[10px] text-gray-400 uppercase tracking-wide">{p.category}</p>}
                  <div className="mt-2">
                    <CloneProductButton shareId={id} productId={p.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
