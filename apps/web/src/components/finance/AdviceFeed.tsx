'use client';

import { motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import type { Advice, AdviceAction } from '@/lib/finance-engine';
import { TONE_META } from './finance-ui';

interface Props {
  readonly advice: readonly Advice[];
  readonly onAction: (action: AdviceAction) => void;
}

/**
 * Una tarjeta: qué pasa, por qué y qué hacer. La tarjeta ENTERA lleva a
 * resolverlo.
 *
 * Antes la acción vivía en una píldora de 11 px al pie del texto. En un móvil
 * era el objetivo más pequeño de la pantalla, justo debajo del párrafo más
 * largo, y dejaba el 90 % de la tarjeta muerta al tacto. Ahora se toca donde
 * caiga el dedo.
 *
 * El cuerpo va en la familia de lectura y a 16 px: son párrafos que explican,
 * no etiquetas de un dato, y en 12 px de la misma sans que el resto de la
 * interfaz se leían como letra pequeña que se puede saltar.
 */
function AdviceCard({
  item,
  index,
  onAction,
}: {
  readonly item: Advice;
  readonly index: number;
  readonly onAction: (action: AdviceAction) => void;
}) {
  const tone = TONE_META[item.tone];
  const action = item.action;
  // Sin acción la tarjeta es solo información: no se anuncia tocable.
  const Wrapper = action ? motion.button : motion.article;

  return (
    <Wrapper
      {...(action
        ? {
            type: 'button' as const,
            onClick: () => {
              haptic(10);
              onAction(action);
            },
            'aria-label': `${item.title}. ${action.label}`,
          }
        : {})}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 280, damping: 26 }}
      className={`w-full rounded-2xl border p-4 flex gap-3 text-left transition ${tone.card} ${
        action ? 'active:scale-[0.99] hover:brightness-[0.98]' : ''
      }`}
    >
      <span className="text-2xl leading-none shrink-0" aria-hidden="true">{item.icon}</span>

      <div className="min-w-0 flex-1">
        <h3 className={`text-base font-black leading-snug ${tone.title}`}>{item.title}</h3>

        <p className={`font-reading text-[16px] mt-1.5 leading-relaxed ${tone.body}`}>{item.body}</p>

        {/* Las opciones, una por línea. En una sola frase separadas por punto y
            coma eran ilegibles justo donde el usuario buscaba qué hacer. */}
        {item.steps && item.steps.length > 0 && (
          <ul className="mt-2.5 space-y-1.5">
            {item.steps.map((step) => (
              <li
                key={step}
                className={`font-reading text-[15px] leading-relaxed flex gap-2 ${tone.body}`}
              >
                <span aria-hidden="true" className="shrink-0 text-slate-400">·</span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Ya no hay botón: la etiqueta de la acción se queda como pista de a
            dónde lleva tocar, en el sitio donde estaría el enlace. */}
        {action && <p className="mt-2.5 text-xs font-bold text-sky-700">{action.label} →</p>}
      </div>
    </Wrapper>
  );
}

/** Encabezado de grupo: dice de qué hablan las tarjetas que vienen debajo. */
function GroupTitle({
  emoji,
  text,
  count,
}: {
  readonly emoji: string;
  readonly text: string;
  readonly count: number;
}) {
  return (
    <div className="flex items-baseline gap-2 pt-1">
      <h3 className="text-lg font-black text-black">
        <span aria-hidden="true">{emoji}</span> {text}
      </h3>
      <span className="text-[11px] text-slate-400">
        {count} {count === 1 ? 'consejo' : 'consejos'}
      </span>
    </div>
  );
}

/**
 * El consejero, en dos bloques con su propio título.
 *
 * Iban todos en una lista plana y no había forma de saber a qué se refería cada
 * uno: entre un aviso de deudas y otro del super aparecía «Viajar a Uruguay está
 * parada» sin nada que dijera que eso hablaba de una meta. Agrupados, el título
 * responde esa pregunta antes de leer la tarjeta.
 *
 * Las metas van DESPUÉS de lo general a propósito: lo general suele ser la
 * causa —el mes no da— y las metas la consecuencia.
 */
export default function AdviceFeed({ advice, onAction }: Props) {
  if (advice.length === 0) return null;

  const goals = advice.filter((a) => a.topic === 'goals');
  const general = advice.filter((a) => a.topic !== 'goals');

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-black text-black">
          🧠 Tu consejero financiero
        </h2>
        <span className="text-[11px] text-slate-400">
          {advice.length} {advice.length === 1 ? 'recomendación' : 'recomendaciones'}
        </span>
      </div>

      {/* Sin consejos de metas no se monta ningún encabezado: con un solo grupo,
          titularlo sería anunciar una división que no existe. */}
      {goals.length > 0 && general.length > 0 && (
        <GroupTitle emoji="💵" text="Sobre tu mes" count={general.length} />
      )}
      {general.map((item, i) => (
        <AdviceCard key={item.id} item={item} index={i} onAction={onAction} />
      ))}

      {goals.length > 0 && (
        <>
          <GroupTitle emoji="🎯" text="Sobre tus metas" count={goals.length} />
          {goals.map((item, i) => (
            <AdviceCard key={item.id} item={item} index={general.length + i} onAction={onAction} />
          ))}
        </>
      )}
    </section>
  );
}
