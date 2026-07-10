/** Labeled divider that separates the major zones of a dashboard page. */
export default function SectionHeader({
  emoji,
  title,
  centered = false,
}: {
  readonly emoji: string;
  readonly title: string;
  readonly centered?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {centered && (
        <div className="flex-1 h-px bg-linear-to-l from-stone-200 dark:from-stone-800 to-transparent" aria-hidden="true" />
      )}
      <span aria-hidden="true" className="text-base leading-none">{emoji}</span>
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400 whitespace-nowrap">
        {title}
      </h2>
      <div className="flex-1 h-px bg-linear-to-r from-stone-200 dark:from-stone-800 to-transparent" aria-hidden="true" />
    </div>
  );
}
