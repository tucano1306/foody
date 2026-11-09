import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/session';
import { listarTiendas, type TiendasDelUsuario } from '@/lib/stores-data';
import ModernTitle from '@/components/layout/ModernTitle';
import TiendasView from '@/components/stores/TiendasView';

export const metadata: Metadata = { title: 'Tiendas — Foody' };

const VACIO: TiendasDelUsuario = { tiendas: [], sucursales: [], repetidas: [] };

export default async function TiendasPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  // Si la base falla, la pantalla sale vacía en vez de romperse: guardar una
  // ubicación sigue funcionando y la lista vuelve en cuanto responda.
  const datos = await listarTiendas(session.userId).catch(() => VACIO);
  const ubicadas = datos.tiendas.filter((t) => t.sucursales.some((s) => s.lat !== null)).length;

  return (
    <div className="space-y-5">
      <ModernTitle
        title="Tiendas"
        subtitle={
          datos.tiendas.length === 0
            ? 'Dónde compras'
            : `${datos.tiendas.length} ${datos.tiendas.length === 1 ? 'tienda' : 'tiendas'} · ${ubicadas} en el mapa`
        }
      />
      <TiendasView inicial={datos} />
    </div>
  );
}
