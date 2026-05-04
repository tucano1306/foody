import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import dynamic from 'next/dynamic';
import Navbar from '@/components/layout/Navbar';
import PullToRefresh from '@/components/layout/PullToRefresh';
import type { Product } from '@foody/types';

// Heavy components loaded dynamically to reduce initial JS bundle
const CommandPalette = dynamic(() => import('@/components/layout/CommandPalette'), { ssr: false });
const VoiceAssistant = dynamic(() => import('@/components/voice/VoiceAssistant'), { ssr: false });
const OfflineSync = dynamic(() => import('@/components/pwa/OfflineSync'), { ssr: false });
const FocusRefresh = dynamic(() => import('@/components/pwa/FocusRefresh'), { ssr: false });
const PushNotifications = dynamic(() => import('@/components/pwa/PushNotifications'), { ssr: false });
const OnboardingTour = dynamic(() => import('@/components/layout/OnboardingTour'), { ssr: false });
const PwaInstaller = dynamic(() => import('@/components/pwa/PwaInstaller'), { ssr: false });

export default async function AppLayout({ children }: { readonly children: React.ReactNode }) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect('/login');

  let products: Product[] = [];
  try {
    products = await api.products.list();
  } catch {
    // ignore — palette still works with nav-only commands
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-stone-50">
      <PullToRefresh />
      <Navbar user={{ name: session.name, avatarUrl: session.avatarUrl, email: session.email }} />
      <main className="flex-1 min-w-0 px-3 sm:px-4 lg:px-8 py-4 sm:py-6 max-w-5xl mx-auto w-full pb-6">
        {children}
      </main>
      <CommandPalette products={products} />
      <VoiceAssistant />
      <OfflineSync />
      <FocusRefresh />
      <PushNotifications />
      <OnboardingTour />
      <PwaInstaller />
    </div>
  );
}
