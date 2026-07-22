/** Color accents so each dashboard zone reads as its own area at a glance. */
const TONES = {
  neutral: {
    pill: 'from-stone-100 via-white to-stone-100 dark:from-stone-800 dark:via-stone-900 dark:to-stone-800',
    ring: 'ring-stone-200/80 dark:ring-stone-700/70',
    text: 'text-stone-600 dark:text-stone-300',
    bar: 'via-stone-300 dark:via-stone-700',
  },
  brand: {
    // The brand palette stops at 900 — no brand-950 to reach for here.
    pill: 'from-sky-100 via-brand-50 to-sky-100 dark:from-brand-900/70 dark:via-navy-900 dark:to-brand-900/70',
    ring: 'ring-sky-200/80 dark:ring-brand-800/70',
    text: 'text-brand-600 dark:text-sky-300',
    bar: 'via-sky-300 dark:via-brand-700',
  },
  green: {
    pill: 'from-emerald-100 via-lime-50 to-emerald-100 dark:from-emerald-950/70 dark:via-lime-950/40 dark:to-emerald-950/70',
    ring: 'ring-emerald-200/80 dark:ring-emerald-900/70',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'via-emerald-300 dark:via-emerald-800',
  },
  amber: {
    pill: 'from-amber-100 via-yellow-50 to-amber-100 dark:from-amber-950/70 dark:via-yellow-950/40 dark:to-amber-950/70',
    ring: 'ring-amber-200/80 dark:ring-amber-900/70',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'via-amber-300 dark:via-amber-800',
  },
  violet: {
    pill: 'from-violet-100 via-indigo-50 to-violet-100 dark:from-violet-950/70 dark:via-indigo-950/40 dark:to-violet-950/70',
    ring: 'ring-violet-200/80 dark:ring-violet-900/70',
    text: 'text-violet-700 dark:text-violet-300',
    bar: 'via-violet-300 dark:via-violet-800',
  },
} as const;

export type SectionTone = keyof typeof TONES;

/**
 * Labeled divider that separates the major zones of a dashboard page.
 * The colored pill + rules are deliberately loud: on a long scrolling page
 * they're the only cue that one zone ended and the next began.
 */
export default function SectionHeader({
  emoji,
  title,
  subtitle,
  centered = false,
  tone = 'neutral',
}: {
  readonly emoji: string;
  readonly title: string;
  /** Optional one-liner shown under the pill — says what the zone is for. */
  readonly subtitle?: string;
  readonly centered?: boolean;
  readonly tone?: SectionTone;
}) {
  const t = TONES[tone];
  const rule = `h-[3px] rounded-full bg-linear-to-r from-transparent ${t.bar} to-transparent`;

  return (
    <div className={centered ? 'text-center' : ''}>
      <div className="flex items-center gap-3 sm:gap-4">
        {centered && <div className={`flex-1 ${rule}`} aria-hidden="true" />}

        <div
          className={`inline-flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0 rounded-full py-1.5 pl-1.5 pr-3.5 sm:pr-5 bg-linear-to-r ${t.pill} ring-1 ${t.ring} shadow-sm`}
        >
          <span
            aria-hidden="true"
            className={`grid place-items-center w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white/90 dark:bg-stone-900/80 ring-1 ${t.ring} text-base sm:text-xl leading-none shadow-sm`}
          >
            {emoji}
          </span>
          <h2
            className={`text-[13px] sm:text-base font-extrabold uppercase tracking-[0.08em] sm:tracking-[0.12em] truncate ${t.text}`}
          >
            {title}
          </h2>
        </div>

        <div className={`flex-1 ${rule}`} aria-hidden="true" />
      </div>

      {subtitle && (
        <p className="mt-2 text-xs sm:text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
      )}
    </div>
  );
}
