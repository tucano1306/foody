import { describe, it, expect } from 'vitest';
import {
  buildPaymentAggregates,
  formatMonthShort,
  listUnpaidMonths,
  monthKey,
  type PaidRecordInput,
} from './payment-aggregates';

// Fixed "now" so the tests are deterministic regardless of when they run.
// 2026-07-09 (July), due day 5 already passed this month.
const NOW = new Date(2026, 6, 9);

function paid(month: number, year: number, amount = 18, actualAmount: number | null = null): PaidRecordInput {
  return { month, year, amount, actualAmount, paidAt: new Date(year, month - 1, 6).toISOString() };
}

describe('listUnpaidMonths', () => {
  it('collects every due-passed month without a paid record, oldest first', () => {
    // Created in May 2026, due day 5, nothing paid → May, June and July owe.
    const out = listUnpaidMonths(new Date(2026, 4, 1), 5, new Set(), NOW);
    expect(out).toEqual([
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
      { month: 7, year: 2026 },
    ]);
  });

  it('excludes the current month while its due day has not passed', () => {
    // Due day 20: July 20 is still ahead of July 9 → only May and June owe.
    const out = listUnpaidMonths(new Date(2026, 4, 1), 20, new Set(), NOW);
    expect(out).toEqual([
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
    ]);
  });

  it('skips months that were paid', () => {
    const paidKeys = new Set([monthKey(2026, 5), monthKey(2026, 7)]);
    const out = listUnpaidMonths(new Date(2026, 4, 1), 5, paidKeys, NOW);
    expect(out).toEqual([{ month: 6, year: 2026 }]);
  });

  it('returns nothing for a payment created this month before its due day passed', () => {
    const out = listUnpaidMonths(new Date(2026, 6, 1), 20, new Set(), NOW);
    expect(out).toEqual([]);
  });

  it('clamps the due day on short months', () => {
    // Due day 31 in February resolves to Feb 28/29 — must not loop forever.
    const out = listUnpaidMonths(new Date(2026, 1, 1), 31, new Set(), new Date(2026, 2, 5));
    expect(out).toEqual([{ month: 2, year: 2026 }]);
  });
});

describe('buildPaymentAggregates', () => {
  it('accumulates $18 per missed month — two missed months owe $36', () => {
    const aggr = buildPaymentAggregates({
      createdAt: new Date(2026, 4, 1),
      dueDay: 5,
      amount: 18,
      paidRecords: [paid(5, 2026)],
      now: NOW,
    });
    // June + July due-passed and unpaid → 2 × $18 = $36
    expect(aggr.missedMonths).toBe(2);
    expect(aggr.accumulatedDebt).toBe(36);
    expect(aggr.isPaidThisMonth).toBe(false);
  });

  it('sums the all-time paid history preferring the actual amount', () => {
    const aggr = buildPaymentAggregates({
      createdAt: new Date(2026, 3, 1),
      dueDay: 5,
      amount: 18,
      paidRecords: [paid(4, 2026), paid(5, 2026, 18, 20.5), paid(6, 2026)],
      now: NOW,
    });
    expect(aggr.totalPaidAllTime).toBeCloseTo(18 + 20.5 + 18);
    expect(aggr.paidCountAllTime).toBe(3);
    expect(aggr.lastPaidAt).toBe(new Date(2026, 5, 6).toISOString());
  });

  it('flags the current month as paid when its record exists', () => {
    const aggr = buildPaymentAggregates({
      createdAt: new Date(2026, 5, 1),
      dueDay: 5,
      amount: 18,
      paidRecords: [paid(6, 2026), paid(7, 2026)],
      now: NOW,
    });
    expect(aggr.isPaidThisMonth).toBe(true);
    expect(aggr.missedMonths).toBe(0);
    expect(aggr.accumulatedDebt).toBe(0);
  });
});

describe('formatMonthShort', () => {
  it('omits the year for the current year and appends it otherwise', () => {
    expect(formatMonthShort({ month: 5, year: 2026 }, NOW)).toBe('may');
    expect(formatMonthShort({ month: 12, year: 2025 }, NOW)).toBe('dic 25');
  });
});
