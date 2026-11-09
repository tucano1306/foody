'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowTopRightOnSquareIcon, CheckIcon, ChevronRightIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  centroDe,
  conPunto,
  decidirTienda,
  detectarTienda,
  distanciaMetros,
  enlaceComoLlegar,
  RADIO_LLEGADA_M,
  textoDistancia,
  type Posicion,
  type SeleccionTienda,
  type SucursalConPunto,
} from '@/lib/geo';
import { expenseKindMeta } from '@/lib/expense-kind';
import {
  claveDeTienda,
  etiquetaSucursal,
  lugarDeSucursal,
  quitarVoyA,
  type Sucursal,
  type TiendaResumen,
} from '@/lib/tiendas';
import { usePosicion } from '@/lib/use-posicion';
import { useToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/haptic';
import Hoja from '@/components/stores/Hoja';
import BuscarEnMapa from '@/components/stores/BuscarEnMapa';

/**
 * La tienda de la compra en curso, puesta desde el principio y no al final.
 *
 * - «¿A dónde vas?»: se elige de tus tiendas, o se escribe/dicta («voy a
 *   Publix»). Con la tienda puesta, «Cómo llegar» abre la ruta.
 * - Al llegar: con el Súper abierto se compara tu posición con tus
 *   sucursales guardadas. Dentro de ~150 m la pone sola y avisa; con dos
 *   tiendas pegadas pregunta en cuál estás. Lo elegido a mano manda: si
 *   dijiste Publix y estás en CVS, propone el cambio, no lo hace.
 *
 * La posición se queda en el teléfono. A la base solo va qué sucursal es,
 * y solo al cerrar la compra.
 */

interface Props {
  readonly tiendas: readonly TiendaResumen[];
  readonly sucursales: readonly Sucursal[];
  readonly seleccion: SeleccionTienda | null;
  readonly onCambiar: (s: SeleccionTienda | null) => void;
}

type Aviso =
  | { readonly tipo: 'sugerir'; readonly sucursal: SucursalConPunto }
  | { readonly tipo: 'preguntar'; readonly candidatas: readonly SucursalConPunto[] };

export default function TiendaDelViaje({ tiendas, sucursales, seleccion, onCambiar }: Props) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  // Sucursales guardadas desde aquí mismo (buscar en el mapa): cuentan ya,
  // sin esperar a que la página vuelva a pedir la lista.
  const [nuevas, setNuevas] = useState<readonly Sucursal[]>([]);
  const todas = useMemo(() => [...sucursales, ...nuevas], [sucursales, nuevas]);
  const ubicadas = useMemo(() => todas.filter(conPunto), [todas]);

  const { posicion } = usePosicion({ vigilar: ubicadas.length > 0 });

  // ─── Llegada ───────────────────────────────────────────────────────────────
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [descartadas, setDescartadas] = useState<ReadonlySet<string>>(() => new Set());
  const alCambiar = useRef(onCambiar);
  alCambiar.current = onCambiar;

  const nombreActual = seleccion?.nombre ?? null;
  const idActual = seleccion?.storeId ?? null;
  const origenActual = seleccion?.origen ?? null;

  useEffect(() => {
    if (!posicion || ubicadas.length === 0) return;
    const actual: SeleccionTienda | null =
      nombreActual && origenActual ? { nombre: nombreActual, storeId: idActual, origen: origenActual } : null;
    const d = decidirTienda(actual, detectarTienda(posicion, ubicadas), descartadas);
    if (d.tipo === 'nada') {
      setAviso(null);
      return;
    }
    if (d.tipo === 'poner') {
      setAviso(null);
      alCambiar.current({ nombre: d.sucursal.nombre, storeId: d.sucursal.id, origen: d.origen });
      // Solo se avisa cuando cambia la TIENDA; apuntar en qué Publix estás,
      // si ya ibas a Publix, no merece interrumpir.
      if (!actual || claveDeTienda(actual.nombre) !== claveDeTienda(d.sucursal.nombre)) {
        haptic([10, 40, 10]);
        toast.show(`Estás en ${etiquetaSucursal(d.sucursal)}`, 'info');
      }
      return;
    }
    setAviso(d.tipo === 'sugerir' ? { tipo: 'sugerir', sucursal: d.sucursal } : { tipo: 'preguntar', candidatas: d.candidatas });
  }, [posicion, ubicadas, descartadas, nombreActual, idActual, origenActual, toast]);

  const descartar = (ids: readonly string[]) => {
    setDescartadas((prev) => new Set([...prev, ...ids]));
    setAviso(null);
  };

  /**
   * Una elección a mano también dice «sé dónde estoy». Las sucursales de OTRA
   * tienda que tienes al lado se dan por vistas: si estás en el Publix y eliges
   * Aldi (vas después), o quitas la tienda, no tiene sentido que al segundo
   * salga «¿Estás en Publix?» o que la app la vuelva a poner sola.
   */
  const elegirAMano = (s: SeleccionTienda | null) => {
    setAviso(null);
    if (posicion) {
      const clave = s ? claveDeTienda(s.nombre) : null;
      const alLado = ubicadas
        .filter((u) => distanciaMetros(posicion, u) <= RADIO_LLEGADA_M + 50 && claveDeTienda(u.nombre) !== clave)
        .map((u) => u.id);
      if (alLado.length > 0) setDescartadas((prev) => new Set([...prev, ...alLado]));
    }
    onCambiar(s);
  };

  const elegirSucursal = (s: Sucursal) => {
    haptic(10);
    elegirAMano({ nombre: s.nombre, storeId: s.id, origen: 'elegida' });
  };

  // ─── El chip ───────────────────────────────────────────────────────────────
  const sucursalActual = idActual ? todas.find((s) => s.id === idActual) ?? null : null;
  const etiqueta = sucursalActual ? etiquetaSucursal(sucursalActual) : nombreActual;
  const distanciaActual = posicion && sucursalActual && conPunto(sucursalActual) ? distanciaMetros(posicion, sucursalActual) : null;
  // «Cómo llegar» mientras no estés ya allí.
  const mostrarRuta =
    sucursalActual && conPunto(sucursalActual) && (distanciaActual === null || distanciaActual > RADIO_LLEGADA_M + 50);

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {aviso && (
          <motion.div
            key={aviso.tipo === 'sugerir' ? aviso.sucursal.id : aviso.candidatas.map((c) => c.id).join('|')}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="status"
            className="rounded-3xl bg-[var(--accent-soft)] px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <p className="flex-1 min-w-0 font-bold text-[var(--ink)] truncate">
                {aviso.tipo === 'sugerir' ? `¿Estás en ${etiquetaSucursal(aviso.sucursal)}?` : '¿En cuál estás?'}
              </p>
              <button
                type="button"
                aria-label="No"
                onClick={() => descartar(aviso.tipo === 'sugerir' ? [aviso.sucursal.id] : aviso.candidatas.map((c) => c.id))}
                className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-[var(--ink-muted)] transition active:scale-90"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(aviso.tipo === 'sugerir' ? [aviso.sucursal] : aviso.candidatas).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => elegirSucursal(s)}
                  className="btn-primary px-4 py-2 text-sm font-bold"
                >
                  {aviso.tipo === 'sugerir' ? 'Sí, cambiar' : etiquetaSucursal(s)}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={etiqueta ? `Tienda: ${etiqueta}. Cambiar` : 'Elegir tienda'}
          className={`min-w-0 flex-1 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] ${
            etiqueta
              ? 'bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] shadow-[var(--shadow-xs)]'
              : 'bg-[var(--surface-2)] text-[var(--ink-muted)]'
          }`}
        >
          <span aria-hidden="true">📍</span>
          <span className="truncate">{etiqueta ?? '¿Dónde compras?'}</span>
          <ChevronRightIcon className="ml-auto shrink-0 w-4 h-4 text-[var(--ink-subtle)]" aria-hidden="true" />
        </button>
        {mostrarRuta && sucursalActual && conPunto(sucursalActual) && (
          <a
            href={enlaceComoLlegar(sucursalActual)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-3.5 py-2.5 text-sm font-bold text-[var(--accent)] transition active:scale-95"
          >
            Cómo llegar
            <ArrowTopRightOnSquareIcon className="w-4 h-4" aria-hidden="true" />
          </a>
        )}
      </div>

      <AnimatePresence>
        {abierto && (
          <SelectorDeTienda
            tiendas={tiendas}
            sucursales={todas}
            seleccion={seleccion}
            posicion={posicion}
            onElegir={(s) => {
              haptic(10);
              elegirAMano(s);
              setAbierto(false);
            }}
            onGuardada={(s) => {
              setNuevas((prev) => [...prev, s]);
              elegirAMano({ nombre: s.nombre, storeId: s.id, origen: 'elegida' });
              setAbierto(false);
            }}
            onClose={() => setAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── «¿A dónde vas?» ─────────────────────────────────────────────────────────

interface FilaDelSelector {
  readonly tienda: TiendaResumen;
  readonly ubicadas: readonly SucursalConPunto[];
  /** Metros a su sucursal más cercana, si se sabe dónde estás. */
  readonly distancia: number | null;
}

/**
 * Orden de la lista: con posición, primero lo que tienes cerca (es a donde
 * vas casi siempre); sin ella, lo que más usas. Exportada para probarla.
 */
export function ordenarParaElegir(
  tiendas: readonly TiendaResumen[],
  sucursales: readonly Sucursal[],
  posicion: Posicion | null,
  texto: string,
): FilaDelSelector[] {
  const buscada = claveDeTienda(texto);
  const filas = tiendas
    .filter((t) => !buscada || claveDeTienda(t.nombre).includes(buscada))
    .map((tienda) => {
      const clave = claveDeTienda(tienda.nombre);
      // Las sucursales por nombre, no solo las de la tienda: una recién
      // guardada desde el mapa aún no está en `tienda.sucursales`.
      const ubicadas = sucursales.filter((s): s is SucursalConPunto => conPunto(s) && claveDeTienda(s.nombre) === clave);
      const distancia = posicion && ubicadas.length > 0 ? Math.min(...ubicadas.map((s) => distanciaMetros(posicion, s))) : null;
      return { tienda, ubicadas, distancia };
    });
  if (!posicion) return filas;
  return filas.sort((a, b) => {
    if (a.distancia !== null && b.distancia !== null) return a.distancia - b.distancia;
    if (a.distancia !== null) return -1;
    if (b.distancia !== null) return 1;
    return b.tienda.usos - a.tienda.usos;
  });
}

/** Qué sucursal poner al elegir una tienda: la más cercana, o la única. */
export function sucursalAlElegir(ubicadas: readonly SucursalConPunto[], posicion: Posicion | null): SucursalConPunto | null {
  if (ubicadas.length === 0) return null;
  if (!posicion) return ubicadas.length === 1 ? ubicadas[0] : null;
  return [...ubicadas].sort((a, b) => distanciaMetros(posicion, a) - distanciaMetros(posicion, b))[0];
}

function SelectorDeTienda({
  tiendas,
  sucursales,
  seleccion,
  posicion,
  onElegir,
  onGuardada,
  onClose,
}: {
  readonly tiendas: readonly TiendaResumen[];
  readonly sucursales: readonly Sucursal[];
  readonly seleccion: SeleccionTienda | null;
  readonly posicion: Posicion | null;
  readonly onElegir: (s: SeleccionTienda | null) => void;
  readonly onGuardada: (s: Sucursal) => void;
  readonly onClose: () => void;
}) {
  const [escrito, setEscrito] = useState('');
  const [enMapa, setEnMapa] = useState(false);
  const texto = quitarVoyA(escrito);
  const filas = useMemo(() => ordenarParaElegir(tiendas, sucursales, posicion, texto), [tiendas, sucursales, posicion, texto]);
  const exacta = texto ? tiendas.some((t) => claveDeTienda(t.nombre) === claveDeTienda(texto)) : true;
  const claveActual = seleccion ? claveDeTienda(seleccion.nombre) : null;

  const elegirTienda = (f: FilaDelSelector) => {
    const s = sucursalAlElegir(f.ubicadas, posicion);
    onElegir({ nombre: f.tienda.nombre, storeId: s?.id ?? null, origen: 'elegida' });
  };

  // Enter con una sola coincidencia la elige; si no hay ninguna, usa lo escrito.
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto) return;
    if (filas.length === 1) elegirTienda(filas[0]);
    else if (filas.length === 0) onElegir({ nombre: texto, storeId: null, origen: 'elegida' });
  };

  const cerca = posicion ?? centroDe(sucursales.filter(conPunto));

  return (
    <>
      <Hoja
        titulo="¿A dónde vas?"
        emoji="📍"
        onClose={onClose}
        pie={
          <div className="flex items-center gap-2">
            {seleccion && (
              <button
                type="button"
                onClick={() => onElegir(null)}
                className="rounded-full px-4 py-3 text-sm font-bold text-[var(--ink-muted)] bg-[var(--surface-2)] transition active:scale-95"
              >
                Quitar tienda
              </button>
            )}
            <Link
              href="/stores"
              className="ml-auto inline-flex items-center gap-1 rounded-full px-4 py-3 text-sm font-bold text-[var(--accent)] transition active:scale-95"
            >
              Tus tiendas
              <ChevronRightIcon className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        }
      >
        <form onSubmit={alEnviar} role="search">
          <div className="relative">
            <MagnifyingGlassIcon aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ink-subtle)]" />
            <input
              type="search"
              enterKeyHint="go"
              aria-label="Tienda"
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              placeholder="Voy a…"
              maxLength={255}
              autoComplete="off"
              className="w-full rounded-full bg-[var(--surface-2)] pl-11 pr-4 py-3 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </form>

        {texto && !exacta && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onElegir({ nombre: texto, storeId: null, origen: 'elegida' })}
              className="btn-primary px-4 py-2.5 text-sm font-bold max-w-full truncate"
            >
              Usar «{texto}»
            </button>
            {texto.length >= 2 && (
              <button
                type="button"
                onClick={() => setEnMapa(true)}
                className="btn-soft px-4 py-2.5 text-sm font-bold max-w-full truncate"
              >
                🗺️ Buscar en el mapa
              </button>
            )}
          </div>
        )}

        <ul className="mt-3 space-y-2" aria-label="Tus tiendas">
          {filas.map((f) => {
            const activa = claveActual === claveDeTienda(f.tienda.nombre);
            const kind = expenseKindMeta(f.tienda.kind);
            return (
              <li key={f.tienda.nombre}>
                <button
                  type="button"
                  aria-pressed={activa}
                  onClick={() => elegirTienda(f)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.98] ${
                    activa ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="shrink-0 text-xl" aria-hidden="true">{kind.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold truncate">{f.tienda.nombre}</span>
                    <span className="block t-meta truncate">
                      {f.distancia !== null
                        ? textoDistancia(f.distancia)
                        : f.tienda.usos > 0
                          ? `${f.tienda.usos} ${f.tienda.usos === 1 ? 'compra' : 'compras'}`
                          : 'Nueva'}
                    </span>
                  </span>
                  {activa && <CheckIcon className="shrink-0 w-5 h-5 text-[var(--accent)]" aria-hidden="true" />}
                </button>
                {/* Con varias sucursales, cada una de un toque: «el Publix de
                    Biscayne», no «el más cercano a donde estoy ahora». */}
                {f.ubicadas.length > 1 && (
                  <div className="mt-1.5 ml-10 flex flex-wrap gap-1.5">
                    {f.ubicadas.map((s) => {
                      const esta = seleccion?.storeId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={esta}
                          onClick={() => onElegir({ nombre: f.tienda.nombre, storeId: s.id, origen: 'elegida' })}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                            esta ? 'bg-[var(--cta)] text-[var(--on-cta)]' : 'bg-[var(--surface)] border border-[var(--line)] text-[var(--ink-muted)]'
                          }`}
                        >
                          {lugarDeSucursal(s) ?? 'Sin calle'}
                          {posicion && <span className="ml-1 opacity-70">{textoDistancia(distanciaMetros(posicion, s))}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Hoja>

      <AnimatePresence>
        {enMapa && (
          <BuscarEnMapa
            consultaInicial={texto}
            cerca={cerca}
            yo={posicion}
            onGuardada={(s) => {
              setEnMapa(false);
              onGuardada(s);
            }}
            onClose={() => setEnMapa(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
