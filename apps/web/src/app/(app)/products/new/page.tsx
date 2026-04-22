import ProductForm from '@/components/products/ProductForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Agregar Producto' };

export default function NewProductPage() {
  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <a href="/products" className="text-brand-500 hover:underline text-sm">
          ← Volver a productos
        </a>
        <h1 className="text-2xl font-bold text-stone-800 mt-2">Agregar Producto</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
        <ProductForm />
      </div>
    </div>
  );
}
