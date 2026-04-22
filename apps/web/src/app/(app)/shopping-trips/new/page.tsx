import NewTripForm from './NewTripForm';
import { api } from '@/lib/api';
import type { Product } from '@foody/types';

export default async function NewShoppingTripPage() {
  let products: Product[] = [];
  try {
    products = await api.products.list();
  } catch {
    products = [];
  }
  return <NewTripForm products={products} />;
}
