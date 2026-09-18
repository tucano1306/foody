import NewTripForm from './NewTripForm';
import { api, type ProductAliasLookup } from '@/lib/api';
import type { Product } from '@foody/types';

export default async function NewShoppingTripPage() {
  let products: Product[] = [];
  try {
    products = await api.products.listWithoutPhotos();
  } catch {
    products = [];
  }

  // Los alias van aparte y con su propio catch: si esta consulta falla, el
  // ticket se sigue registrando igual y solo se pierde el emparejado
  // automático de los nombres aprendidos.
  let aliases: ProductAliasLookup[] = [];
  try {
    aliases = await api.productAliases.list();
  } catch {
    aliases = [];
  }

  return <NewTripForm products={products} aliases={aliases} />;
}
