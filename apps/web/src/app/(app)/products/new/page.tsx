import ProductForm from '@/components/products/ProductForm';
import { getSession } from '@/lib/session';
import { sql } from '@/lib/db';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Agregar Producto' };

export default async function NewProductPage() {
  const session = await getSession();
  let inHousehold = false;
  if (session.isLoggedIn && session.userId) {
    const rows = await sql`SELECT household_id FROM users WHERE id = ${session.userId} LIMIT 1`;
    inHousehold = Boolean((rows[0] as { household_id: string | null } | undefined)?.household_id);
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <a href="/products" className="text-brand-500 hover:underline text-sm">
          ← Volver a productos
        </a>
        <h1 className="text-2xl font-bold text-stone-800 mt-2">Agregar Producto</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
        <ProductForm inHousehold={inHousehold} />
      </div>
    </div>
  );
}
