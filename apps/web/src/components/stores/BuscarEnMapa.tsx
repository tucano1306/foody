'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { textoDistancia, type Punto } from '@/lib/geo';
import type { LugarEncontrado } from '@/lib/osm';
import { limpiarNombreTienda, type Sucursal } from '@/lib/tiendas';
import { buscarLugares, calleDe, conDistanciaDesde, guardarSucursal } from '@/lib/tiendas-cliente';
import { useToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/haptic';
import Hoja from './Hoja';
import type { PuntoDelMapa } from './MapaTiendas';

const MapaTiendas = dynamic(() => import('./MapaTiendas'), { ssr: false });

/**
 * Buscar una tienda en el mapa de OpenStreetMap y guardar dónde está.
 *
 * Se busca al pulsar Buscar, nunca mientras se escribe: Nominatim es gratis
 * con la condición de no pasar de una consulta por segundo, y teclear «Publix»
 * serían seis. Si el resultado no es el bueno, un toque en el mapa pone el pin
 * donde está de verdad (y la calle se pide al guardar).
 *
 * `nombreFijo`: viene de una tienda que ya existe; lo que se guarda es una
 * sucursal más de ella. Sin él, el nombre se escribe aquí.
 */

interface Elegido extends Punto {
  readonly direccion: string | null;
  /** Índice del resultado, o null si es un toque en el mapa. */
  readonly indice: number | null;
}

interface Props {
  readonly nombreFijo?: string;
  readonly consultaInicial?: string;
  /** Dónde buscar «cerca»: tu posición o tus tiendas. Sin él, en todas partes. */
  readonly cerca: Punto | null;
  /** Dónde estás, si se sabe: da las distancias de la lista. */
  readonly yo?: Punto | null;
  readonly onGuardada: (s: Sucursal) => void;
  readonly onClose: () => void;
}

export default function BuscarEnMapa({ nombreFijo, consultaInicial, cerca, yo = null, onGuardada, onClose }: Props) {
  const toast = useToast();
  const [consulta, setConsulta] = useState(consultaInicial ?? nombreFijo ?? '');
  const [nombre, setNombre] = useState(consultaInicial ?? '');
  const [resultados, setResultados] = useState<readonly LugarEncontrado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    const q = consulta.trim();
    if (q.length < 2 || buscando) return;
    setBuscando(true);
    setElegido(null);
    try {
      const r = conDistanciaDesde(yo, await buscarLugares(q, cerca));
      setResultados(r);
      if (!nombreFijo && !nombre.trim()) setNombre(q);
      if (r.length === 1) setElegido({ ...r[0], indice: 0 });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'El buscador no responde ahora', 'error');
    } finally {
      setBuscando(false);
    }
  }

  // Si ya se sabe qué buscar (la tienda, o lo escrito en el Súper), se busca
  // al abrir: es la consulta que el dueño iba a lanzar de todos modos.
  const buscadoAlAbrir = useRef(false);
  useEffect(() => {
    if (buscadoAlAbrir.current) return;
    buscadoAlAbrir.current = true;
    if (consulta.trim().length >= 2) void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);

  const elegir = (i: number) => {
    const r = resultados?.[i];
    if (!r) return;
    haptic(8);
    setElegido({ lat: r.lat, lng: r.lng, direccion: r.direccion, indice: i });
  };

  const puntos = useMemo<PuntoDelMapa[]>(() => {
    const lista: PuntoDelMapa[] = (resultados ?? []).map((r, i) => ({
      id: `r${i}`,
      lat: r.lat,
      lng: r.lng,
      etiqueta: r.nombre,
      tipo: elegido?.indice === i ? 'elegido' : 'resultado',
    }));
    if (elegido && elegido.indice === null) {
      lista.push({ id: 'tocado', lat: elegido.lat, lng: elegido.lng, etiqueta: 'Aquí', tipo: 'elegido' });
    }
    return lista;
  }, [resultados, elegido]);

  const nombreFinal = limpiarNombreTienda(nombreFijo ?? nombre);

  async function guardar() {
    if (!elegido || !nombreFinal || guardando) return;
    setGuardando(true);
    try {
      // Un toque en el mapa no trae calle: se pregunta ahora. Si el buscador
      // no responde, se guarda sin ella; la ubicación es lo que importa.
      const direccion = elegido.direccion ?? (await calleDe(elegido));
      const s = await guardarSucursal({ nombre: nombreFinal, direccion, lat: elegido.lat, lng: elegido.lng });
      haptic([10, 30, 10]);
      onGuardada(s);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
      setGuardando(false);
    }
  }

  return (
    <Hoja
      titulo={nombreFijo ? `¿Dónde está ${nombreFijo}?` : 'Buscar una tienda'}
      emoji="🗺️"
      onClose={onClose}
      pie={
        <div className="space-y-3">
          {!nombreFijo && (
            <input
              aria-label="Nombre de la tienda"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de la tienda"
              maxLength={255}
              className="w-full rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={!elegido || !nombreFinal || guardando}
            className="btn-primary w-full py-3.5 text-base font-extrabold disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar aquí'}
          </button>
        </div>
      }
    >
      <form onSubmit={buscar} className="flex gap-2" role="search">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ink-subtle)]" />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Buscar en el mapa"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Publix, CVS, una calle…"
            maxLength={100}
            className="w-full rounded-full bg-[var(--surface-2)] pl-11 pr-4 py-3 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <button
          type="submit"
          disabled={consulta.trim().length < 2 || buscando}
          className="btn-soft shrink-0 px-5 text-sm font-bold disabled:opacity-40"
        >
          {buscando ? '…' : 'Buscar'}
        </button>
      </form>

      <MapaTiendas
        puntos={puntos}
        centro={cerca}
        etiqueta="Mapa: toca para poner el pin"
        onTocarPunto={(id) => elegir(Number(id.slice(1)))}
        onTocarMapa={(p) => {
          haptic(8);
          setElegido({ ...p, direccion: null, indice: null });
        }}
        className="h-60 mt-3"
      />

      {resultados && resultados.length === 0 && (
        <p className="t-meta mt-3 text-center">Nada con ese nombre por aquí. Toca el mapa donde está.</p>
      )}

      {resultados && resultados.length > 0 && (
        <ol className="mt-3 space-y-2" aria-label="Resultados">
          {resultados.map((r, i) => {
            const activo = elegido?.indice === i;
            return (
              <li key={`${r.lat},${r.lng}`}>
                <button
                  type="button"
                  aria-pressed={activo}
                  onClick={() => elegir(i)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.98] ${
                    activo ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-[var(--surface)] text-xs font-extrabold text-[var(--accent)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold truncate">{r.nombre}</span>
                    {r.direccion && <span className="block t-meta truncate">{r.direccion}</span>}
                  </span>
                  {r.distancia !== null && (
                    <span className="shrink-0 t-meta tabular-nums">{textoDistancia(r.distancia)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Hoja>
  );
}
