'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { CheckIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { cuandoVence, type AgendaPagos, type EntradaAgenda } from '@/lib/agenda-pagos';

type Filtro = 'all' | 'pending' | 'paid';

interface Props {
  readonly mes: string;
  readonly total: number;
  readonly pagado: number;
  readonly pospuesto: number;
  readonly cuantosPagados: number;
  readonly cuantosPendientes: number;
  readonly agenda: AgendaPagos;
  readonly filtro: Filtro;
  readonly onFiltro: (f: Filtro) => void;
  readonly onAbrir: (id: string) => void;
  readonly formato: (n: number) => string;
  readonly iconoDe: (category: string | null) => string;
}

/**
 * El mes de pagos en una pieza: cuánto llevas pagado, cuánto falta y qué
 * sale en los próximos días.
 *
 * Antes eran tres tarjetas iguales (total, pagado, pendiente), cada una con su
 * círculo de color y su icono, que había que leer y restar de cabeza; y el
 * «cuándo» estaba repartido por la lista de abajo. Ahora una barra enseña la
 * proporción del mes ya pagada, los dos chips de debajo filtran la lista igual
 * que las tarjetas de antes, y la agenda pone en orden lo que viene.
 */
export default function MesDePagos({
  mes,
  total,
  pagado,
  pospuesto,
  cuantosPagados,
  cuantosPendientes,
  agenda,
  filtro,
  onFiltro,
  onAbrir,
  formato,
  iconoDe,
}: Props) {
  const reducir = useReducedMotion();
  const falta = Math.max(0, total - pagado);
  const parte = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);
  const muelle = reducir ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 22 };
  const alternar = (f: Filtro) => onFiltro(filtro === f ? 'all' : f);

  return (
    <section aria-label={`Pagos de ${mes}`} className="card overflow-hidden" style={{ backgroundImage: 'var(--aurora-soft)' }}>
      <div className="p-4 sm:p-5">
        <p className="t-label">Pagos de {mes}</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-[family-name:var(--font-display)] tracking-tight">
          <span className="t-num text-[2.1rem] leading-tight text-aurora">{formato(pagado)}</span>
          <span className="text-base font-semibold text-[var(--ink-muted)]">
            de <span className="t-num">{formato(total)}</span>
          </span>
        </p>

        {/* La barra del mes: lo pagado en aurora y lo pospuesto rayado, para
            que «falta» no parezca más urgente de lo que es. */}
        <div
          role="img"
          aria-label={`Pagado ${formato(pagado)} de ${formato(total)}`}
          className="mt-3 relative h-3 rounded-full bg-[var(--surface-3)] overflow-hidden"
        >
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundImage: 'var(--aurora)' }}
            initial={reducir ? false : { width: 0 }}
            animate={{ width: `${parte(pagado)}%` }}
            transition={muelle}
          />
          {pospuesto > 0 && (
            <motion.span
              className="absolute inset-y-0 rounded-full bg-[repeating-linear-gradient(45deg,var(--color-brand-300)_0_4px,transparent_4px_8px)]"
              initial={false}
              animate={{ left: `${parte(pagado)}%`, width: `${parte(pospuesto)}%` }}
              transition={muelle}
            />
          )}
        </div>

        {/* Los dos chips son los filtros de la lista: el mismo gesto que las
            tarjetas de antes, con el dato dentro. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Chip
            activo={filtro === 'paid'}
            onClick={() => alternar('paid')}
            Icono={CheckIcon}
            titulo="Pagados"
            cifra={formato(pagado)}
            detalle={`${cuantosPagados} ${cuantosPagados === 1 ? 'pago' : 'pagos'}`}
          />
          <Chip
            activo={filtro === 'pending'}
            onClick={() => alternar('pending')}
            Icono={ClockIcon}
            titulo="Por pagar"
            cifra={formato(falta)}
            detalle={`${cuantosPendientes} ${cuantosPendientes === 1 ? 'pago' : 'pagos'}`}
            extra={pospuesto > 0 ? `${formato(pospuesto)} pospuesto` : undefined}
          />
        </div>
      </div>

      {(agenda.vencidos.length > 0 || agenda.proximos.length > 0) && (
        <div className="border-t border-[var(--line)] bg-[var(--surface)]/60 px-4 py-3 sm:px-5 space-y-3">
          {agenda.vencidos.length > 0 && (
            <Grupo
              titulo="Vencido"
              total={formato(agenda.totalVencidos)}
              entradas={agenda.vencidos}
              onAbrir={onAbrir}
              formato={formato}
              iconoDe={iconoDe}
              vencido
            />
          )}
          {agenda.proximos.length > 0 && (
            <Grupo
              titulo="Próximos 7 días"
              total={formato(agenda.totalProximos)}
              entradas={agenda.proximos}
              onAbrir={onAbrir}
              formato={formato}
              iconoDe={iconoDe}
            />
          )}
        </div>
      )}
    </section>
  );
}

function Grupo({
  titulo,
  total,
  entradas,
  onAbrir,
  formato,
  iconoDe,
  vencido = false,
}: {
  readonly titulo: string;
  readonly total: string;
  readonly entradas: readonly EntradaAgenda[];
  readonly onAbrir: (id: string) => void;
  readonly formato: (n: number) => string;
  readonly iconoDe: (category: string | null) => string;
  readonly vencido?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 t-label">
          {vencido && <ExclamationTriangleIcon aria-hidden="true" className="w-4 h-4 text-[var(--accent)]" />}
          {titulo}
        </span>
        <span className="t-num text-[13px] text-[var(--ink)]">{total}</span>
      </p>
      <ul className="space-y-1">
        {entradas.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onAbrir(e.id)}
              className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--surface-2)] active:scale-[0.99]"
            >
              <span
                aria-hidden="true"
                className={`grid place-items-center w-9 h-9 shrink-0 rounded-xl text-base ${
                  vencido || e.dias <= 1 ? 'shadow-[var(--glow)]' : 'bg-[var(--surface-2)]'
                }`}
                style={vencido || e.dias <= 1 ? { backgroundImage: 'var(--aurora)' } : undefined}
              >
                {iconoDe(e.category)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[var(--ink)] truncate">{e.name}</span>
                <span className="block t-meta">
                  {vencido ? `venció ${cuandoVence(e.dias)}` : `vence ${cuandoVence(e.dias)}`}
                </span>
              </span>
              <span className="t-num text-sm text-[var(--ink)] shrink-0">{formato(e.importe)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Un chip-filtro del mes. Título con su icono en una línea, la cifra en otra
 * y el detalle debajo: en un móvil cada chip tiene ~150 px, y «Falta $2,002.99
 * · 5 pagos» en una sola línea se partía por donde quería.
 */
function Chip({
  activo,
  onClick,
  Icono,
  titulo,
  cifra,
  detalle,
  extra,
}: {
  readonly activo: boolean;
  readonly onClick: () => void;
  readonly Icono: typeof CheckIcon;
  readonly titulo: string;
  readonly cifra: string;
  readonly detalle: string;
  readonly extra?: string;
}) {
  const tenue = activo ? 'text-white/80' : 'text-[var(--ink-subtle)]';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.97] ${
        activo
          ? 'border-transparent text-white shadow-[var(--glow)]'
          : 'border-[var(--line)] bg-[var(--surface)]/80 text-[var(--ink)]'
      }`}
      style={activo ? { backgroundImage: 'var(--aurora)' } : undefined}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold leading-tight">
        <Icono aria-hidden="true" className={`w-4 h-4 shrink-0 ${activo ? 'text-white' : 'text-[var(--accent)]'}`} />
        {titulo}
      </span>
      <span className="mt-1 block t-num text-[15px] leading-tight">{cifra}</span>
      <span className={`block text-[11px] tabular-nums ${tenue}`}>{detalle}</span>
      {extra && <span className={`block text-[11px] tabular-nums ${tenue}`}>{extra}</span>}
    </button>
  );
}
