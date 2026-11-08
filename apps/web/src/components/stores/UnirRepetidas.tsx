'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { claveDeTienda, type GrupoRepetido } from '@/lib/tiendas';
import { unirTiendas } from '@/lib/tiendas-cliente';
import { useToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/haptic';

/**
 * «¿Son la misma tienda?»: CVS, Cvs y CVS Pharmacy en una tarjeta, con el
 * nombre que se propone dejar ya marcado. Un toque en otro nombre lo cambia;
 * «Unir» reescribe las compras de todas.
 *
 * Nada se une solo: la raíz de un nombre junta de más a propósito, y quien
 * sabe si «Publix» y «Publix Pharmacy» son el mismo gasto es el dueño.
 *
 * «No son la misma» la esconde en ESTE teléfono (localStorage). No hace falta
 * más: si vuelve a salir en otro, otro toque la esconde allí.
 */

const CLAVE_ESCONDIDAS = 'foody-tiendas-no-unir-v1';

/** La firma de un grupo: sus variantes, sin mayúsculas ni orden. */
export function firmaDeGrupo(g: GrupoRepetido): string {
  return [...new Set(g.variantes.map((v) => claveDeTienda(v.nombre)))].sort().join('|');
}

function leerEscondidas(): Set<string> {
  try {
    const crudo = localStorage.getItem(CLAVE_ESCONDIDAS);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function guardarEscondidas(s: ReadonlySet<string>) {
  try {
    localStorage.setItem(CLAVE_ESCONDIDAS, JSON.stringify([...s]));
  } catch {
    /* sin almacenamiento: la tarjeta se esconde hasta recargar, y basta */
  }
}

interface Props {
  readonly grupos: readonly GrupoRepetido[];
  /** Tras unir: la pantalla vuelve a pedir las tiendas. */
  readonly onUnidas: () => void;
}

export default function UnirRepetidas({ grupos, onUnidas }: Props) {
  // Hasta leer el almacenamiento no se pinta nada: así no aparece una tarjeta
  // ya descartada durante un instante al entrar.
  const [escondidas, setEscondidas] = useState<Set<string> | null>(null);
  useEffect(() => setEscondidas(leerEscondidas()), []);

  if (!escondidas) return null;
  const visibles = grupos.filter((g) => !escondidas.has(firmaDeGrupo(g)));
  if (visibles.length === 0) return null;

  const esconder = (g: GrupoRepetido) => {
    const nuevas = new Set(escondidas);
    nuevas.add(firmaDeGrupo(g));
    guardarEscondidas(nuevas);
    setEscondidas(nuevas);
  };

  return (
    <section aria-label="Tiendas repetidas" className="space-y-3">
      <AnimatePresence initial={false}>
        {visibles.map((g) => (
          <TarjetaDeUnion key={firmaDeGrupo(g)} grupo={g} onEsconder={() => esconder(g)} onUnidas={onUnidas} />
        ))}
      </AnimatePresence>
    </section>
  );
}

function TarjetaDeUnion({
  grupo,
  onEsconder,
  onUnidas,
}: {
  readonly grupo: GrupoRepetido;
  readonly onEsconder: () => void;
  readonly onUnidas: () => void;
}) {
  const toast = useToast();
  const [elegido, setElegido] = useState(grupo.nombre);
  const [uniendo, setUniendo] = useState(false);
  const compras = grupo.variantes.reduce((n, v) => n + v.usos, 0);

  async function unir() {
    if (uniendo) return;
    setUniendo(true);
    haptic(12);
    try {
      const r = await unirTiendas(
        grupo.variantes.map((v) => v.nombre),
        elegido,
      );
      toast.show(`Unidas en «${r.nombre}»`, 'success');
      onUnidas();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo unir', 'error');
      setUniendo(false);
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      className="rounded-3xl bg-[var(--surface)] border border-[var(--line)] p-4 shadow-[var(--shadow-sm)]"
    >
      <h3 className="font-extrabold text-[var(--ink)]">¿Son la misma tienda?</h3>
      <p className="t-meta mt-0.5">{compras} compras con {grupo.variantes.length} nombres</p>

      <div role="radiogroup" aria-label="Nombre que se queda" className="mt-3 flex flex-wrap gap-2">
        {grupo.variantes.map((v) => {
          const activo = v.nombre === elegido;
          return (
            <button
              key={v.nombre}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setElegido(v.nombre)}
              className={`rounded-full px-3.5 py-2 text-sm font-bold transition active:scale-95 ${
                activo
                  ? 'bg-[var(--cta)] text-[var(--on-cta)] shadow-sm'
                  : 'bg-[var(--surface-2)] text-[var(--ink)]'
              }`}
            >
              {v.nombre}
              <span className={`ml-1.5 font-semibold ${activo ? 'opacity-80' : 'text-[var(--ink-muted)]'}`}>{v.usos}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onEsconder}
          disabled={uniendo}
          className="flex-1 rounded-full py-3 text-sm font-bold text-[var(--ink-muted)] bg-[var(--surface-2)] transition active:scale-95 disabled:opacity-50"
        >
          No son la misma
        </button>
        <button
          type="button"
          onClick={unir}
          disabled={uniendo}
          className="btn-primary flex-[1.4] py-3 text-sm font-extrabold disabled:opacity-60 truncate px-3"
        >
          {uniendo ? 'Uniendo…' : `Unir en «${elegido}»`}
        </button>
      </div>
    </motion.article>
  );
}
