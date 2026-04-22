'use client';

import { useMemo, useState } from 'react';

/**
 * FPL-inspired modern stats wheel.
 * Renders a donut chart as a single SVG circle with segments
 * built via stroke-dasharray. All blues, light-to-deep, to match
 * the navy brand palette.
 */

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
}

/** Light-to-deep blue palette (cohesive, FPL-style). */
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

export default function StatsWheel(props: Readonly<Props>) {
  const {
    data,
    totalLabel = 'Total',
    totalValue,
    size = 220,
    thickness = 28,
    formatValue,
  } = props;

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const total = useMemo(
    () => data.reduce((acc, s) => acc + s.value, 0),
    [data],
  );

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

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 drop-shadow-sm"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="transparent"
            stroke="#e0f2fe"
            strokeWidth={thickness}
          />
          {/* Segments */}
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
                className="cursor-pointer transition-all duration-500 ease-out"
                style={{
                  opacity: isDimmed ? 0.35 : 1,
                }}
                onMouseEnter={() => setActiveIndex(s.index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(s.index)}
                onBlur={() => setActiveIndex(null)}
              />
            );
          })}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {active ? (
            <>
              <span className="text-[10px] uppercase tracking-wider text-sky-500 font-bold">
                {active.label}
              </span>
              <span className="text-xl font-extrabold text-brand-800 tabular-nums">
                {formatValue ? formatValue(active.value) : active.value}
              </span>
              <span className="text-[11px] text-stone-400 font-medium tabular-nums">
                {active.pct.toFixed(0)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                {totalLabel}
              </span>
              <span className="text-xl font-extrabold text-brand-800 tabular-nums">
                {totalValue}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <ul className="flex-1 w-full space-y-2 text-sm">
        {slices.map((s) => {
          const isActive = activeIndex === s.index;
          return (
            <li
              key={s.label}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-300 ${
                isActive ? 'bg-sky-50' : ''
              }`}
              onMouseEnter={() => setActiveIndex(s.index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 transition-transform duration-300"
                style={{
                  backgroundColor: s.color,
                  transform: isActive ? 'scale(1.3)' : 'scale(1)',
                }}
              />
              <span className="flex-1 text-stone-700 truncate font-medium">
                {s.label}
              </span>
              {s.sublabel && (
                <span className="text-xs text-stone-400 shrink-0">
                  {s.sublabel}
                </span>
              )}
              <span className="text-stone-600 text-xs tabular-nums font-semibold shrink-0">
                {formatValue ? formatValue(s.value) : s.value}
              </span>
              <span className="w-10 text-right text-xs font-bold text-sky-600 tabular-nums shrink-0">
                {s.pct.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
