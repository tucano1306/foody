'use client';

import { useMemo, useState } from 'react';

export interface WheelSlice {
  readonly label: string;
  readonly value: number;
  readonly sublabel?: string;
}

interface Props {
  readonly data: readonly WheelSlice[];
  readonly totalLabel?: string;
  readonly totalValue: string;
  readonly size?: number;
  readonly thickness?: number;
  readonly formatValue?: (value: number) => string;
  /** Max legend rows shown before collapsing (default 5) */
  readonly maxLegendItems?: number;
}

/** Light-to-deep blue palette. */
const BLUE_PALETTE: readonly string[] = [
  '#38bdf8', // sky-400
  '#0ea5e9', // sky-500
  '#0284c7', // sky-600
  '#7dd3fc', // sky-300
  '#0369a1', // sky-700
  '#bae6fd', // sky-200
  '#075985', // sky-800
  '#0c4a6e', // sky-900
];

export default function StatsWheel(props: Readonly<Props>) {
  const {
    data,
    totalLabel = 'Total',
    totalValue,
    size = 160,
    thickness = 24,
    formatValue,
    maxLegendItems = 5,
  } = props;

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const total = useMemo(() => data.reduce((acc, s) => acc + s.value, 0), [data]);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const slices = useMemo(() => {
    let offset = 0;
    return data.map((slice, i) => {
      const fraction = total === 0 ? 0 : slice.value / total;
      const length = fraction * circumference;
      const segment = {
        ...slice,
        color: BLUE_PALETTE[i % BLUE_PALETTE.length],
        offset,
        length,
        pct: fraction * 100,
        index: i,
      };
      offset += length;
      return segment;
    });
  }, [data, total, circumference]);

  const active = activeIndex == null ? null : slices[activeIndex];
  const legendSlices = slices.slice(0, maxLegendItems);
  const hiddenCount = slices.length - legendSlices.length;

  return (
    <div className="flex flex-row items-center gap-4 w-full min-w-0">
      {/* ── Donut ─────────────────────────────────────────── */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          {/* Track — adapts to dark mode via currentColor trick */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={thickness}
            className="text-stone-200 dark:text-stone-700"
          />
          {slices.map((s) => {
            const isActive = activeIndex === s.index;
            const isDimmed = activeIndex != null && !isActive;
            return (
              <circle
                key={s.label}
                cx={cx}
                cy={cy}
                r={radius}
                fill="transparent"
                stroke={s.color}
                strokeWidth={isActive ? thickness + 4 : thickness}
                strokeDasharray={`${s.length} ${circumference - s.length}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="butt"
                className="cursor-pointer transition-all duration-300"
                style={{ opacity: isDimmed ? 0.3 : 1 }}
                onMouseEnter={() => setActiveIndex(s.index)}
                onMouseLeave={() => setActiveIndex(null)}
                onTouchStart={() => setActiveIndex(s.index)}
              />
            );
          })}
        </svg>

        {/* Center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
          {active ? (
            <>
              <span className="text-[9px] uppercase tracking-wide text-sky-500 font-bold text-center leading-tight line-clamp-1 w-full">
                {active.label}
              </span>
              <span className="text-base font-extrabold text-stone-800 dark:text-stone-100 tabular-nums leading-tight">
                {formatValue ? formatValue(active.value) : active.value}
              </span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium tabular-nums">
                {active.pct.toFixed(0)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[9px] uppercase tracking-wide text-stone-400 dark:text-stone-500 font-semibold">
                {totalLabel}
              </span>
              <span className="text-lg font-extrabold text-stone-800 dark:text-stone-100 tabular-nums leading-tight">
                {totalValue}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────── */}
      <ul className="flex-1 min-w-0 space-y-1.5">
        {legendSlices.map((s) => {
          const isActive = activeIndex === s.index;
          return (
            <li
              key={s.label}
              className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-200 cursor-default ${
                isActive ? 'bg-sky-50 dark:bg-sky-900/30' : ''
              }`}
              onMouseEnter={() => setActiveIndex(s.index)}
              onMouseLeave={() => setActiveIndex(null)}
              onTouchStart={() => setActiveIndex((prev) => prev === s.index ? null : s.index)}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 text-xs text-stone-700 dark:text-stone-200 truncate font-medium">
                {s.label}
              </span>
              <span className="text-xs tabular-nums font-semibold text-stone-500 dark:text-stone-400 shrink-0">
                {formatValue ? formatValue(s.value) : s.value}
              </span>
              <span className="w-8 text-right text-[11px] font-bold text-sky-600 dark:text-sky-400 tabular-nums shrink-0">
                {s.pct.toFixed(0)}%
              </span>
            </li>
          );
        })}
        {hiddenCount > 0 && (
          <li className="text-[11px] text-stone-400 dark:text-stone-600 px-1.5">
            +{hiddenCount} más
          </li>
        )}
      </ul>
    </div>
  );
}
