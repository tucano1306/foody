import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { api } from '@/lib/api';
import ProductForm from '@/components/products/ProductForm';
import type { Product } from '@foody/types';

export const metadata: Metadata = { title: 'Editar Producto' };

export default async function EditProductPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  let product: Product | null = null;
  try {
    product = await api.products.get(id);
  } catch {
    notFound();
  }

  if (!product) {
    notFound();
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <a href="/products" className="text-brand-500 hover:underline text-sm">
          ← Volver a productos
        </a>
        <h1 className="text-2xl font-bold text-stone-800 mt-2">Editar {product.name}</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
        <ProductForm product={product} />
      </div>
    </div>
  );
}
