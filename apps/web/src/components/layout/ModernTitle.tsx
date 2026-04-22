import type { ReactNode } from 'react';

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  readonly align?: 'left' | 'center';
  readonly onDark?: boolean;
  readonly action?: ReactNode;
}

export default function ModernTitle({
  title,
  subtitle,
  align = 'left',
  onDark = false,
  action,
}: Readonly<Props>) {
  const titleCls = onDark ? 'text-white' : 'text-stone-900';
  const subtitleCls = onDark ? 'text-brand-100' : 'text-stone-500';
  const alignCls = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  const barAlignCls = align === 'center' ? 'mx-auto' : '';

  const centerRowCls = align === 'center' ? 'items-center' : 'items-start';
  const outerCls = action
    ? `flex ${centerRowCls} justify-between gap-3 sm:gap-4`
    : `flex flex-col ${alignCls}`;

  return (
    <div className={outerCls}>
      <div className={action ? `flex flex-col ${alignCls} min-w-0 flex-1` : 'min-w-0'}>
        <h1
          className={`text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight drop-shadow-sm ${titleCls}`}
        >
          {title}
        </h1>
        {subtitle && (
          <p className={`text-xs sm:text-sm mt-1 sm:mt-1.5 ${subtitleCls}`}>{subtitle}</p>
        )}
        <div
          className={`h-1 mt-2 sm:mt-3 rounded-full shadow-md bg-linear-to-r from-brand-600 via-sky-400 to-energy-400 w-20 sm:w-32 ${barAlignCls}`}
          aria-hidden="true"
        />
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}
