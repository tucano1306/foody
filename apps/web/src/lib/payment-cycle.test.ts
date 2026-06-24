import { describe, it, expect } from 'vitest';
import { daysUntilNextDue, nextDueDate } from './payment-cycle';

// Fixed "now" so the tests are deterministic regardless of when they run.
// 2026-06-10 (June has 30 days).
const NOW = new Date(2026, 5, 10);

describe('daysUntilNextDue', () => {
  it('counts down to this month when unpaid and the due day is still ahead', () => {
    // due day 15, today 10 → 5 days left
    expect(daysUntilNextDue(15, false, NOW)).toBe(5);
  });

  it('returns 0 when the due day is today and unpaid', () => {
    expect(daysUntilNextDue(10, false, NOW)).toBe(0);
  });

  it('is negative (overdue) when unpaid and the due day already passed', () => {
    // due day 5, today 10 → 5 days overdue
    expect(daysUntilNextDue(5, false, NOW)).toBe(-5);
  });

  it('restarts toward next month once the current cycle is paid', () => {
    // Paid this month, due day 5 → next due is July 5 → 25 days from June 10
    expect(daysUntilNextDue(5, true, NOW)).toBe(25);
  });

  it('restarts toward next month even when paid before the due day', () => {
    // Paid this month, due day 15 → next due is July 15 → 35 days from June 10
    expect(daysUntilNextDue(15, true, NOW)).toBe(35);
  });
});

describe('nextDueDate', () => {
  it('points at this month when unpaid', () => {
    const due = nextDueDate(15, false, NOW);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(5); // June
    expect(due.getDate()).toBe(15);
  });

  it('rolls forward to next month when paid', () => {
    const due = nextDueDate(15, true, NOW);
    expect(due.getMonth()).toBe(6); // July
    expect(due.getDate()).toBe(15);
  });

  it('clamps the due day to the length of a shorter month', () => {
    // Paid in January with due day 31 → next month is February → clamps to 28 (2026 is not a leap year)
    const jan = new Date(2026, 0, 15);
    const due = nextDueDate(31, true, jan);
    expect(due.getMonth()).toBe(1); // February
    expect(due.getDate()).toBe(28);
  });
});
