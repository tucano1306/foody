'use client';

import { useMemo, useState } from 'react';

export interface BarItem {
  readonly label: string;
  readonly value: number;
  readonly sublabel?: string;
}

interface Props {
  readonly data: readonly BarItem[];
  readonly unit?: string;
  readonly maxBarHeight?: number;
}

/** Light-to-deep blue palette (FPL-style, matches StatsWheel). */
const BLUE_PALETTE: readonly string[] = [
  '#bae6fd', // sky-200
  '#7dd3fc', // sky-300
  '#38bdf8', // sky-400
  '#0ea5e9', // sky-500
  '#0284c7', // sky-600
  '#0369a1', // sky-700
  '#075985', // sky-800
  '#0c4a6e', // sky-900
];

export default function StatsBars(props: Readonly<Props>) {
  const { data, unit = '', maxBarHeight = 180 } = props;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1, ...data.map((d) => d.value)),
    [data],
  );

  return (
    <div className="w-full">
      <div
        className="flex items-end justify-around gap-2 sm:gap-4 w-full px-2 pt-10"
        style={{ minHeight: maxBarHeight + 60 }}
      >
        {data.map((item, i) => {
          const height = (item.value / max) * maxBarHeight;
          const color = BLUE_PALETTE[i % BLUE_PALETTE.length];
          const isActive = activeIndex === i;
          const isDimmed = activeIndex != null && !isActive;
          const displayLabel =
            item.label.length > 14 ? item.label.slice(0, 13) + '…' : item.label;

          return (
            <button
              key={item.label}
              type="button"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
              className="group flex flex-col items-center gap-2 flex-1 min-w-0 max-w-20 focus:outline-none"
              aria-label={`${item.label}: ${item.value}${unit}`}
            >
              {/* Value above bar */}
              <span
                className={`text-[11px] sm:text-sm font-bold tabular-nums transition-all duration-300 ${
                  isActive ? 'text-brand-700 scale-110' : 'text-stone-700'
                }`}
                style={{ opacity: isDimmed ? 0.4 : 1 }}
              >
                {item.value}
                {unit}
              </span>

              {/* Bar */}
              <div
                className="relative w-full max-w-11 sm:max-w-14 rounded-t-lg transition-all duration-500 ease-out shadow-sm"
                style={{
                  height: `${height}px`,
                  backgroundColor: color,
                  opacity: isDimmed ? 0.45 : 1,
                  transform: isActive ? 'translateY(-4px)' : 'translateY(0)',
                  boxShadow: isActive
                    ? `0 10px 22px -6px ${color}`
                    : '0 2px 6px -2px rgba(15,23,42,0.15)',
                }}
              />

              {/* Label */}
              <span
                className="text-[10px] sm:text-xs text-stone-500 font-medium truncate max-w-full leading-tight text-center"
                title={item.label}
              >
                {displayLabel}
              </span>
              {item.sublabel && (
                <span className="text-[10px] text-stone-400 truncate max-w-full leading-tight">
                  {item.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
