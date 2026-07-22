'use client';

import { motion } from 'framer-motion';
import type { Advice, AdviceAction } from '@/lib/finance-engine';
import { TONE_META } from './finance-ui';

interface Props {
  readonly advice: readonly Advice[];
  readonly onAction: (action: AdviceAction) => void;
}

/**
 * El consejero: cada tarjeta es una recomendación con números concretos y, si
 * aplica, el botón que la ejecuta. Ordenadas por gravedad desde el motor.
 */
export default function AdviceFeed({ advice, onAction }: Props) {
  if (advice.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-black text-slate-700 dark:text-white uppercase tracking-wide">
          🧠 Tu consejero financiero
        </h2>
        <span className="text-[11px] text-slate-400">{advice.length} recomendaciones</span>
      </div>

      {advice.map((item, i) => {
        const tone = TONE_META[item.tone];
        return (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 280, damping: 26 }}
            className={`rounded-2xl border p-4 flex gap-3 ${tone.card}`}
          >
            <span className="text-2xl leading-none shrink-0" aria-hidden="true">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <h3 className={`text-sm font-black ${tone.title}`}>{item.title}</h3>
              <p className={`text-xs mt-1 leading-relaxed ${tone.body}`}>{item.body}</p>
              {item.action && (
                <button
                  type="button"
                  onClick={() => onAction(item.action as AdviceAction)}
                  className={`mt-2.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold shadow-sm transition ${tone.button}`}
                >
                  {item.action.label} →
                </button>
              )}
            </div>
          </motion.article>
        );
      })}
    </section>
  );
}
