import NewTripForm from './NewTripForm';
import { api, type ProductAliasLookup } from '@/lib/api';
import { normalizeExpenseKind } from '@/lib/expense-kind';
import type { Product } from '@foody/types';

export default async function NewShoppingTripPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  // Con qué tipo abre el formulario. Lo pone la tarjeta desde la que se tocó
  // «Escanear ticket»: desde «Fuera del super» el gasto no es de despensa, y
  // sin esto el formulario arrancaba en Súper y el ticket acababa en Compras.
  // Ante cualquier cosa rara `normalizeExpenseKind` cae a súper, que es como se
  // comportaba antes de existir el parámetro.
  const { kind } = await searchParams;
  const kindInicial = normalizeExpenseKind(kind);

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

  return <NewTripForm products={products} aliases={aliases} kindInicial={kindInicial} />;
}
