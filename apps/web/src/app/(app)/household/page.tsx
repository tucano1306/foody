import HouseholdManager from '@/components/household/HouseholdManager';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mi hogar' };

export default function HouseholdPage() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <ModernTitle
        title="🏡 Mi hogar"
        subtitle="Comparte productos, lista del súper y pagos con tu familia."
      />
      <HouseholdManager />
    </div>
  );
}
