import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { api, type PaletteProduct } from '@/lib/api';
import Navbar from '@/components/layout/Navbar';
import BottomNav from '@/components/layout/BottomNav';
import PrimaryAction from '@/components/layout/PrimaryAction';
import OnboardingTour from '@/components/layout/OnboardingTour';
import PullToRefresh from '@/components/layout/PullToRefresh';
import CommandPalette from '@/components/layout/CommandPalette';
import PwaInstaller from '@/components/pwa/PwaInstaller';
import OfflineSync from '@/components/pwa/OfflineSync';
import FocusRefresh from '@/components/pwa/FocusRefresh';
import PushNotifications from '@/components/pwa/PushNotifications';
import FunBackground from '@/components/fx/FunBackground';

export default async function AppLayout({ children }: { readonly children: React.ReactNode }) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect('/login');

  // Consulta ligera a propósito: este layout corre en CADA página, así que
  // pedir la lista completa traería la foto en base64 de cada producto en toda
  // navegación. El buscador solo necesita nombre y categoría.
  let products: PaletteProduct[] = [];
  try {
    products = await api.products.listForPalette();
  } catch {
    // ignore — palette still works with nav-only commands
  }

  const user = { name: session.name, avatarUrl: session.avatarUrl, email: session.email };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <FunBackground />
      <PullToRefresh />
      <Navbar user={user} />

      {/*
        El padding inferior deja sitio a la barra de pestañas del móvil
        (--tabbar-h ya incluye la muesca de gestos del iPhone). Sin él, la
        última tarjeta de cada lista queda debajo de la barra y no se puede
        tocar. En escritorio no hay barra, así que vuelve a un margen normal.
      */}
      <main
        className="relative z-10 flex-1 min-w-0 px-4 sm:px-5 lg:px-10 py-5 sm:py-7 max-w-5xl mx-auto w-full pb-[calc(var(--tabbar-h)+1.5rem)] md:pb-10"
      >
        {children}
      </main>

      <PrimaryAction />
      <BottomNav user={user} />
      <CommandPalette products={products} />
      <OfflineSync />
      <FocusRefresh />
      <PushNotifications />
      <OnboardingTour />
      <PwaInstaller />
    </div>
  );
}
