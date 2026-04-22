import HouseholdManager from '@/components/household/HouseholdManager';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mi hogar' };

export default function HouseholdPage() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-stone-800">🏡 Mi hogar</h1>
        <p className="text-stone-500 mt-1">
          Comparte productos, lista del súper y pagos con tu familia.
        </p>
      </div>
      <HouseholdManager />
    </div>
  );
}
