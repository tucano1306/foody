'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { ArrowTopRightOnSquareIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { distanciaMetros, enlaceComoLlegar, conPunto, PRECISION_MAXIMA_M, textoDistancia, type Posicion, type Punto } from '@/lib/geo';
import { expenseKindMeta } from '@/lib/expense-kind';
import { limpiarNombreTienda, lugarDeSucursal, type Sucursal, type TiendaResumen } from '@/lib/tiendas';
import { calleDe, guardarSucursal, quitarSucursal, unirTiendas } from '@/lib/tiendas-cliente';
import { textoDeFalloDePosicion, type Lectura } from '@/lib/use-posicion';
import { useToast } from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { haptic } from '@/lib/haptic';
import Hoja from './Hoja';
import BuscarEnMapa from './BuscarEnMapa';
import type { PuntoDelMapa } from './MapaTiendas';

const MapaTiendas = dynamic(() => import('./MapaTiendas'), { ssr: false });

/**
 * Una tienda: dónde están sus sucursales y cómo llegar a cada una.
 *
 * «📍 Estoy aquí» guarda el sitio donde está el teléfono. Es la forma buena
 * de hacerlo: estando en la puerta, la posición ES la tienda, sin buscar
 * nada. Si ya hay una sucursal a menos de 100 m, no se duplica.
 */

/** Más cerca que esto de una sucursal guardada, «Estoy aquí» es la misma. */
const MISMA_SUCURSAL_M = 100;

interface Props {
  readonly tienda: TiendaResumen;
  readonly yo: Posicion | null;
  /** Dónde buscar si no hay posición: el centro de tus tiendas. */
  readonly cerca: Punto | null;
  readonly pedirPosicion: () => Promise<Lectura>;
  /** Algo cambió en la base: vuelve a pedir la lista. `nombre`: el nuevo, si se renombró. */
  readonly onCambio: (nombre?: string) => void;
  readonly onClose: () => void;
}

export default function TiendaSheet({ tienda, yo, cerca, pedirPosicion, onCambio, onClose }: Props) {
  const toast = useToast();
  const [ubicando, setUbicando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [aBorrar, setABorrar] = useState<Sucursal | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState(tienda.nombre);
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  const kind = expenseKindMeta(tienda.kind);
  const ubicadas = tienda.sucursales.filter(conPunto);
  const sinUbicar = tienda.sucursales.length - ubicadas.length;

  const puntos = useMemo<PuntoDelMapa[]>(
    () => ubicadas.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, etiqueta: lugarDeSucursal(s) ?? s.nombre, tipo: 'sucursal' })),
    // `ubicadas` se recalcula en cada render; la lista de ids es lo que cuenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ubicadas.map((s) => s.id).join('|')],
  );

  async function estoyAqui() {
    if (ubicando) return;
    setUbicando(true);
    haptic(10);
    try {
      const r = await pedirPosicion();
      if (!r.ok) {
        toast.show(textoDeFalloDePosicion(r.motivo), 'error');
        return;
      }
      const pos = r.posicion;
      if (pos.precision > PRECISION_MAXIMA_M) {
        toast.show('El GPS aún no te ubica bien; prueba en unos segundos', 'info');
        return;
      }
      if (ubicadas.some((s) => distanciaMetros(pos, s) <= MISMA_SUCURSAL_M)) {
        toast.show('Esta ya estaba guardada', 'info');
        return;
      }
      const direccion = await calleDe(pos);
      await guardarSucursal({ nombre: tienda.nombre, direccion, lat: pos.lat, lng: pos.lng });
      haptic([10, 30, 10]);
      toast.show('Guardada', 'success');
      onCambio();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setUbicando(false);
    }
  }

  async function borrar() {
    if (!aBorrar || borrando) return;
    setBorrando(true);
    try {
      await quitarSucursal(aBorrar.id);
      toast.show('Ubicación quitada', 'success');
      setABorrar(null);
      onCambio();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo quitar', 'error');
    } finally {
      setBorrando(false);
    }
  }

  async function renombrar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = limpiarNombreTienda(nuevoNombre);
    if (!limpio || guardandoNombre) return;
    if (limpio === tienda.nombre) {
      setRenombrando(false);
      return;
    }
    setGuardandoNombre(true);
    try {
      // Cambiar el nombre es «unir» esta tienda en el nombre nuevo: si ya
      // existe otra con ese nombre, sus compras quedan juntas, que es lo que
      // se busca al corregir «Cvs» a «CVS».
      const r = await unirTiendas([tienda.nombre], limpio);
      toast.show(`Ahora es «${r.nombre}»`, 'success');
      setRenombrando(false);
      onCambio(r.nombre);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'No se pudo cambiar', 'error');
    } finally {
      setGuardandoNombre(false);
    }
  }

  const subtitulo =
    tienda.usos === 0 ? 'Sin compras todavía' : `${tienda.usos} ${tienda.usos === 1 ? 'compra' : 'compras'}`;

  return (
    <>
      <Hoja
        titulo={tienda.nombre}
        subtitulo={subtitulo}
        emoji={kind.emoji}
        onClose={onClose}
        pie={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBuscando(true)}
              className="btn-soft flex-1 py-3.5 text-sm font-bold"
            >
              🗺️ Buscar en el mapa
            </button>
            <button
              type="button"
              onClick={estoyAqui}
              disabled={ubicando}
              className="btn-primary flex-1 py-3.5 text-sm font-extrabold disabled:opacity-60"
            >
              {ubicando ? 'Ubicando…' : '📍 Estoy aquí'}
            </button>
          </div>
        }
      >
        {renombrando ? (
          <form onSubmit={renombrar} className="flex gap-2 mb-3">
            <input
              aria-label="Nombre de la tienda"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              maxLength={255}
              autoFocus
              className="flex-1 min-w-0 rounded-full bg-[var(--surface-2)] px-4 py-3 text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={!limpiarNombreTienda(nuevoNombre) || guardandoNombre}
              className="btn-primary shrink-0 px-5 text-sm font-bold disabled:opacity-40"
            >
              {guardandoNombre ? '…' : 'Guardar'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setRenombrando(true)}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--ink-muted)] bg-[var(--surface-2)] transition active:scale-95"
          >
            <PencilIcon className="w-4 h-4" aria-hidden="true" />
            Cambiar nombre
          </button>
        )}

        {ubicadas.length > 0 && (
          <MapaTiendas puntos={puntos} yo={yo} etiqueta={`Mapa de ${tienda.nombre}`} className="h-48" />
        )}

        {tienda.sucursales.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="Sucursales">
            {tienda.sucursales.map((s) => {
              const distancia = yo && conPunto(s) ? distanciaMetros(yo, s) : null;
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-2xl bg-[var(--surface-2)] pl-4 pr-2 py-2.5">
                  <span aria-hidden="true">📍</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold truncate">{lugarDeSucursal(s) ?? (conPunto(s) ? 'Ubicación guardada' : 'Sin ubicación')}</span>
                    {distancia !== null && <span className="block t-meta tabular-nums">{textoDistancia(distancia)}</span>}
                  </span>
                  {conPunto(s) && (
                    <a
                      href={enlaceComoLlegar(s)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--accent)] transition active:scale-95"
                    >
                      Cómo llegar
                      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Quitar ${lugarDeSucursal(s) ?? 'esta ubicación'}`}
                    onClick={() => setABorrar(s)}
                    className="shrink-0 w-9 h-9 grid place-items-center rounded-full text-[var(--ink-subtle)] transition active:scale-90"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {tienda.sucursales.length === 0 && (
          <div className="rounded-3xl bg-[var(--surface-2)] px-5 py-8 text-center">
            <p className="text-3xl" aria-hidden="true">📍</p>
            <p className="mt-2 font-bold">Aún no sabes dónde está</p>
          </div>
        )}

        {sinUbicar > 0 && ubicadas.length > 0 && (
          <p className="t-meta mt-2">
            {sinUbicar} {sinUbicar === 1 ? 'sucursal' : 'sucursales'} sin ubicación
          </p>
        )}
      </Hoja>

      <AnimatePresence>
        {buscando && (
          <BuscarEnMapa
            nombreFijo={tienda.nombre}
            cerca={yo ?? cerca}
            yo={yo}
            onGuardada={() => {
              setBuscando(false);
              toast.show('Guardada', 'success');
              onCambio();
            }}
            onClose={() => setBuscando(false)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={aBorrar !== null}
        title="¿Quitar esta ubicación?"
        message="Las compras de esta tienda se quedan como están."
        confirmLabel="Quitar"
        destructive
        busy={borrando}
        onConfirm={borrar}
        onCancel={() => setABorrar(null)}
      />
    </>
  );
}
