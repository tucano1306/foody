/** Color accents so each dashboard zone reads as its own area at a glance. */
const TONES = {
  neutral: {
    chip: 'from-stone-100 to-stone-200 dark:from-stone-800 dark:to-stone-700 ring-stone-200/70 dark:ring-stone-700/60',
    bar: 'from-stone-300 dark:from-stone-700',
  },
  green: {
    chip: 'from-emerald-100 to-lime-100 dark:from-emerald-950/60 dark:to-lime-950/40 ring-emerald-200/70 dark:ring-emerald-900/60',
    bar: 'from-emerald-300 dark:from-emerald-800',
  },
  amber: {
    chip: 'from-amber-100 to-yellow-100 dark:from-amber-950/60 dark:to-yellow-950/40 ring-amber-200/70 dark:ring-amber-900/60',
    bar: 'from-amber-300 dark:from-amber-800',
  },
  violet: {
    chip: 'from-violet-100 to-indigo-100 dark:from-violet-950/60 dark:to-indigo-950/40 ring-violet-200/70 dark:ring-violet-900/60',
    bar: 'from-violet-300 dark:from-violet-800',
  },
} as const;

export type SectionTone = keyof typeof TONES;

/** Labeled divider that separates the major zones of a dashboard page. */
export default function SectionHeader({
  emoji,
  title,
  centered = false,
  tone = 'neutral',
}: {
  readonly emoji: string;
  readonly title: string;
  readonly centered?: boolean;
  readonly tone?: SectionTone;
}) {
  const t = TONES[tone];
  return (
    <div className="flex items-center gap-3">
      {centered && (
        <div className={`flex-1 h-px bg-linear-to-l ${t.bar} to-transparent`} aria-hidden="true" />
      )}
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center w-8 h-8 rounded-xl bg-linear-to-br ${t.chip} ring-1 text-base leading-none shadow-sm shrink-0`}
      >
        {emoji}
      </span>
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400 whitespace-nowrap">
        {title}
      </h2>
      <div className={`flex-1 h-px bg-linear-to-r ${t.bar} to-transparent`} aria-hidden="true" />
    </div>
  );
}
