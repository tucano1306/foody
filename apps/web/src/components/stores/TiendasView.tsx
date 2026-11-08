'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import { centroDe, conPunto, distanciaMetros, textoDistancia, type Punto } from '@/lib/geo';
import { expenseKindMeta } from '@/lib/expense-kind';
import type { TiendaResumen } from '@/lib/tiendas';
import type { TiendasDelUsuario } from '@/lib/stores-data';
import { cargarTiendas } from '@/lib/tiendas-cliente';
import { usePosicion } from '@/lib/use-posicion';
import { useToast } from '@/components/ui/Toast';
import UnirRepetidas from './UnirRepetidas';
import TiendaSheet from './TiendaSheet';
import BuscarEnMapa from './BuscarEnMapa';
import type { PuntoDelMapa } from './MapaTiendas';

const MapaTiendas = dynamic(() => import('./MapaTiendas'), { ssr: false });

/**
 * Tus tiendas: las que salen de tus compras, con dónde está cada una.
 *
 * La lista sale de lo que ya compraste, no de un alta aparte: una tienda
 * existe porque compraste en ella. Lo único que se añade a mano es DÓNDE
 * está, y eso es lo que hace que el Súper sepa en cuál entras.
 */

export default function TiendasView({ inicial }: { readonly inicial: TiendasDelUsuario }) {
  const toast = useToast();
  const [datos, setDatos] = useState(inicial);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const { posicion, permiso, pedir } = usePosicion({ vigilar: false });

  // Con el permiso ya dado, una lectura al entrar pone las distancias. Sin él
  // no se pregunta: la pantalla sirve igual, y el permiso se pide al tocar
  // «Estoy aquí», que es cuando se entiende para qué es.
  useEffect(() => {
    if (permiso === 'concedido' && !posicion) void pedir();
  }, [permiso, posicion, pedir]);

  const recargar = useCallback(
    async (renombrada?: string) => {
      try {
        const d = await cargarTiendas();
        setDatos(d);
        if (renombrada) setAbierta(renombrada);
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'No se pudo actualizar', 'error');
      }
    },
    [toast],
  );

  const ubicadas = useMemo(() => datos.sucursales.filter(conPunto), [datos.sucursales]);
  const cerca = posicion ?? centroDe(ubicadas);

  const puntos = useMemo<PuntoDelMapa[]>(
    () => ubicadas.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, etiqueta: s.nombre, tipo: 'sucursal' })),
    [ubicadas],
  );

  // Por el nombre exacto: «Publix» y «publix» son dos filas hasta que se unen.
  const tiendaAbierta = abierta ? datos.tiendas.find((t) => t.nombre === abierta) ?? null : null;

  const abrirPorSucursal = (id: string) => {
    const t = datos.tiendas.find((x) => x.sucursales.some((s) => s.id === id));
    if (t) setAbierta(t.nombre);
  };

  return (
    <div className="space-y-5 pb-32">
      <UnirRepetidas grupos={datos.repetidas} onUnidas={() => void recargar()} />

      {puntos.length > 0 && (
        <MapaTiendas
          puntos={puntos}
          yo={posicion}
          etiqueta="Mapa de tus tiendas"
          onTocarPunto={abrirPorSucursal}
          className="h-56"
        />
      )}

      {datos.tiendas.length === 0 ? (
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--line)] px-6 py-12 text-center">
          <p className="text-4xl" aria-hidden="true">🏪</p>
          <p className="mt-3 font-extrabold text-lg">Tus tiendas salen de tus compras</p>
          <p className="t-meta mt-1">Al cerrar la primera, aparece aquí.</p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Tiendas">
          {datos.tiendas.map((t) => (
            <li key={t.nombre}>
              <FilaTienda tienda={t} yo={posicion} onAbrir={() => setAbierta(t.nombre)} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setNueva(true)}
        className="btn-soft w-full py-3.5 text-sm font-bold inline-flex items-center justify-center gap-2"
      >
        <PlusIcon className="w-5 h-5" aria-hidden="true" />
        Otra tienda
      </button>

      <AnimatePresence>
        {tiendaAbierta && (
          <TiendaSheet
            key={tiendaAbierta.nombre}
            tienda={tiendaAbierta}
            yo={posicion}
            cerca={cerca}
            pedirPosicion={pedir}
            onCambio={(nombre) => void recargar(nombre)}
            onClose={() => setAbierta(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nueva && (
          <BuscarEnMapa
            cerca={cerca}
            yo={posicion}
            onGuardada={(s) => {
              setNueva(false);
              toast.show(`${s.nombre} guardada`, 'success');
              void recargar();
            }}
            onClose={() => setNueva(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FilaTienda({
  tienda,
  yo,
  onAbrir,
}: {
  readonly tienda: TiendaResumen;
  readonly yo: Punto | null;
  readonly onAbrir: () => void;
}) {
  const kind = expenseKindMeta(tienda.kind);
  const ubicadas = tienda.sucursales.filter(conPunto);
  const masCerca = yo && ubicadas.length > 0 ? Math.min(...ubicadas.map((s) => distanciaMetros(yo, s))) : null;

  let detalle: string;
  if (ubicadas.length === 0) detalle = 'Sin ubicación';
  else if (masCerca !== null) detalle = textoDistancia(masCerca);
  else detalle = ubicadas.length === 1 ? '📍 Ubicada' : `📍 ${ubicadas.length} sucursales`;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="w-full flex items-center gap-3 rounded-3xl bg-[var(--surface)] border border-[var(--line)] px-4 py-3.5 text-left shadow-[var(--shadow-xs)] transition active:scale-[0.98]"
    >
      <span className="shrink-0 grid place-items-center w-11 h-11 rounded-2xl bg-[var(--surface-2)] text-xl" aria-hidden="true">
        {kind.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold truncate">{tienda.nombre}</span>
        <span className="block t-meta truncate">
          {tienda.usos > 0 ? `${tienda.usos} ${tienda.usos === 1 ? 'compra' : 'compras'} · ` : ''}
          <span className={ubicadas.length === 0 ? 'text-[var(--ink-subtle)]' : ''}>{detalle}</span>
        </span>
      </span>
      <ChevronRightIcon className="shrink-0 w-5 h-5 text-[var(--ink-subtle)]" aria-hidden="true" />
    </button>
  );
}
