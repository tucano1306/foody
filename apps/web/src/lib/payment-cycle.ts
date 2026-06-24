/**
 * Shared helpers for the monthly-payment cycle.
 *
 * A payment is a recurring bill due on a fixed day of the month (`dueDay`).
 * Once the current month's cycle is paid, the countdown "restarts" toward the
 * SAME day next month — that is the behaviour these helpers encode so the UI
 * and the API agree on a single source of truth.
 */

const MS_PER_DAY = 86_400_000;

/** Day-of-month due date for a given month, clamped to that month's length. */
function dueDateFor(year: number, monthIndex: number, dueDay: number): Date {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(dueDay, daysInMonth));
}

/** Midnight (local) of the given date — strips the time component. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The next date this bill must be paid.
 *
 * - If the current cycle is already paid → rolls forward to next month's due day
 *   (the countdown "restarts").
 * - Otherwise → this month's due day (which may already be in the past, i.e. overdue).
 */
export function nextDueDate(
  dueDay: number,
  isPaidThisCycle: boolean,
  now: Date = new Date(),
): Date {
  const year = now.getFullYear();
  const month = now.getMonth();
  return isPaidThisCycle
    ? dueDateFor(year, month + 1, dueDay)
    : dueDateFor(year, month, dueDay);
}

/**
 * Whole days from today until the next due date.
 *
 * - Paid cycle → positive number of days until next month's due day.
 * - Unpaid, upcoming → days remaining (0 = due today).
 * - Unpaid, overdue → negative (e.g. -2 = the due day passed 2 days ago).
 */
export function daysUntilNextDue(
  dueDay: number,
  isPaidThisCycle: boolean,
  now: Date = new Date(),
): number {
  const today = startOfDay(now);
  const due = nextDueDate(dueDay, isPaidThisCycle, now);
  return Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
}
