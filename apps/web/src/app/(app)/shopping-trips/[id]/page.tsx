import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import type { Product, ShoppingTripDetail } from '@foody/types';
import type { Metadata } from 'next';
import TripDetailClient from './TripDetailClient';

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): Promise<Metadata> {
  try {
    const { id } = await params;
    const trip = await api.shoppingTrips.get(id);
    const store = trip?.storeName ?? 'Compra';
    return { title: `🧾 ${store}` };
  } catch {
    return { title: 'Compra' };
  }
}

export default async function TripDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  let trip: ShoppingTripDetail | null = null;
  let products: Product[] = [];
  try {
    [trip, products] = await Promise.all([
      api.shoppingTrips.get(id),
      api.products.listWithoutPhotos(),
    ]);
  } catch {
    notFound();
  }

  if (!trip) {
    notFound();
  }

  return <TripDetailClient trip={trip} products={products} />;
}
