'use client';

import { useState } from 'react';
import { haptic } from '@/lib/haptic';
import ModalShell from '@/components/finance/ModalShell';
import { BTN_PRIMARY, BTN_SOFT, fmtMoney } from '@/components/debts/debt-ui';
import type { AccionPrevista, useComputo } from './useComputo';

interface Props {
  readonly computo: ReturnType<typeof useComputo>;
  readonly onClose: () => void;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «6 oct» a partir de YYYY-MM-DD, sin pasar por zonas horarias. */
function dia(clave: string): string {
  const [, m, d] = clave.split('-').map(Number);
  return `${d} ${MESES[m - 1] ?? ''}`;
}

/** «hace 3 min» / «hace 2 h» / «el 6 oct». */
function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `el ${dia(new Date(iso).toISOString().slice(0, 10))}`;
}

const PREVISTO: Record<AccionPrevista, { texto: string; clase: string }> = {
  creado: { texto: 'Nuevo', clase: 'bg-sky-100 text-sky-800' },
  vinculado: { texto: 'Ya lo tenías: se enlaza', clase: 'bg-blue-100 text-blue-800' },
  actualizado: { texto: 'Se actualiza', clase: 'bg-slate-100 text-slate-700' },
  sin_cambios: { texto: 'Igual', clase: 'bg-slate-100 text-slate-500' },
};

/**
 * La hoja del enlace con Computo.
 *
 * Todo lo que el dueño necesita, en el orden en que lo necesita: ¿está
 * encendido?, ¿desde cuándo?, ¿qué hay por enviar? Y antes de mandar nada,
 * «Revisar» pregunta a Computo qué haría con cada gasto: los que ya estaban
 * tecleados a mano salen como «se enlaza», no como duplicados.
 */
export default function ComputoSheet({ computo, onClose }: Props) {
  const { estado, ocupado, error, guardar, sincronizar, simular, probar } = computo;
  const [previsto, setPrevisto] = useState<Record<string, AccionPrevista> | null>(null);
  const [verCategorias, setVerCategorias] = useState(false);
  if (!estado) return null;

  const pendientes = estado.pendientes;
  const totalPendiente = (pendientes?.nuevos ?? 0) + (pendientes?.quitar ?? 0);
  const hoy = new Date().toLocaleDateString('en-CA');

  async function revisar() {
    haptic();
    const r = await simular(estado?.desde);
    if (r?.resultados) setPrevisto(Object.fromEntries(r.resultados.map((x) => [x.ref, x.accion])));
  }

  async function principal() {
    haptic([10, 30, 10]);
    if (estado?.activo) await sincronizar();
    else await guardar({ activo: true });
    setPrevisto(null);
  }

  let textoPrincipal = 'Sincronizar ahora';
  if (!estado.activo) textoPrincipal = totalPendiente > 0 ? `Encender y enviar ${totalPendiente}` : 'Encender';
  if (ocupado) textoPrincipal = 'Un momento…';

  return (
    <ModalShell
      title="Computo"
      subtitle={estado.empresa ? `Tus gastos entran en ${estado.empresa}` : 'Tus gastos, en tu contabilidad'}
      emoji="📒"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
            Cerrar
          </button>
          <button
            type="button"
            onClick={principal}
            disabled={ocupado}
            className={`flex-[2] rounded-2xl py-3.5 text-sm ${BTN_PRIMARY} disabled:opacity-40`}
          >
            {textoPrincipal}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Encendido + desde cuándo */}
        <div className="rounded-3xl border border-sky-100 bg-white p-4">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-bold text-black">Enviar mis gastos</span>
              <span className="block text-xs text-slate-500">Tickets y pagos, al guardarlos</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={estado.activo}
              disabled={ocupado}
              onChange={(e) => {
                haptic();
                void guardar({ activo: e.target.checked });
              }}
              className="h-6 w-11 cursor-pointer appearance-none rounded-full bg-slate-200 transition before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition checked:bg-sky-500 checked:before:translate-x-[22px]"
              aria-label="Enviar mis gastos a Computo"
            />
          </label>
          <label className="mt-3 flex items-center justify-between gap-3 border-t border-sky-50 pt-3">
            <span className="text-xs font-bold text-slate-600">Desde</span>
            <input
              type="date"
              value={estado.desde}
              max={hoy}
              disabled={ocupado}
              onChange={(e) => {
                setPrevisto(null);
                if (e.target.value) void guardar({ desde: e.target.value });
              }}
              aria-label="Enviar los gastos desde"
              className="rounded-xl bg-sky-50 px-3 py-1.5 text-sm font-semibold text-black focus:outline-none"
            />
          </label>
        </div>

        {/* Cómo fue la última vez */}
        {(error || estado.ultimoError) && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-semibold">{error ?? estado.ultimoError}</p>
            <button type="button" onClick={() => void probar()} disabled={ocupado} className="mt-1 text-xs font-bold underline">
              Probar la conexión
            </button>
          </div>
        )}
        {!error && !estado.ultimoError && estado.ultimaSync && (
          <p className="px-1 text-xs text-slate-500">
            ✓ Última sincronización {haceCuanto(estado.ultimaSync)}
            {estado.ultimoResumen && estado.ultimoResumen.enviados > 0 && ` · ${estado.ultimoResumen.enviados} enviados`}
          </p>
        )}

        {/* Lo que falta por mandar */}
        <section className="rounded-3xl bg-sky-50/80 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-600">
              {totalPendiente === 0 ? 'Nada por enviar' : `${totalPendiente} por enviar`}
            </p>
            {pendientes && pendientes.nuevos > 0 && (
              <button
                type="button"
                onClick={revisar}
                disabled={ocupado}
                className="rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-700 shadow-sm disabled:opacity-50"
              >
                Revisar con Computo
              </button>
            )}
          </div>
          {pendientes && pendientes.muestra.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Gastos por enviar">
              {pendientes.muestra.map((g) => {
                const p = previsto?.[g.ref];
                return (
                  <li key={g.ref} className="rounded-2xl bg-white px-3.5 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-black">{g.descripcion}</span>
                      <span className="shrink-0 text-sm font-extrabold text-black">{fmtMoney(g.monto)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span>{dia(g.fecha)}</span>
                      <span className="text-slate-300">·</span>
                      <span>{g.categoria}</span>
                      {p && <span className={`rounded-full px-2 py-0.5 ${PREVISTO[p].clase}`}>{PREVISTO[p].texto}</span>}
                    </div>
                  </li>
                );
              })}
              {pendientes.nuevos > pendientes.muestra.length && (
                <li className="px-1 text-[11px] text-slate-500">y {pendientes.nuevos - pendientes.muestra.length} más</li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Todo lo de Foody desde el {dia(estado.desde)} ya está en Computo.</p>
          )}
          {pendientes && pendientes.quitar > 0 && (
            <p className="mt-2 text-[11px] text-slate-600">
              {pendientes.quitar} {pendientes.quitar === 1 ? 'gasto borrado' : 'gastos borrados'} en Foody saldrán también de Computo.
            </p>
          )}
        </section>

        {/* Cómo se clasifican */}
        <div>
          <button
            type="button"
            onClick={() => setVerCategorias((v) => !v)}
            aria-expanded={verCategorias}
            className="text-xs font-bold text-slate-500"
          >
            {verCategorias ? '▾' : '▸'} Cómo se clasifican en Computo
          </button>
          {verCategorias && (
            <ul className="mt-2 grid grid-cols-1 gap-1 rounded-2xl border border-sky-100 bg-white p-3 text-xs">
              {estado.categorias.tickets.map((c) => (
                <li key={c.foody} className="flex justify-between gap-3">
                  <span className="text-slate-600">{c.foody}</span>
                  <span className="font-semibold text-black">{c.computo}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-sky-50 pt-1">
                <span className="text-slate-600">💳 Pagos</span>
                <span className="text-right font-semibold text-black">{estado.categorias.pagos.join(', ')}</span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
