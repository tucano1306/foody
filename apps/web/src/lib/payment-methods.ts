import type { PaymentMethod } from '@foody/types';

export interface PaymentMethodOption {
  readonly value: PaymentMethod;
  readonly icon: string;
  /** Full label, e.g. "Tarjeta de crédito" */
  readonly label: string;
  /** Compact label for chips, e.g. "T. Crédito" */
  readonly shortLabel: string;
  readonly hint: string;
}

/** Single source of truth for the selectable payment methods. */
export const PAYMENT_METHODS: readonly PaymentMethodOption[] = [
  { value: 'transfer', icon: '🔁', label: 'Transferencia', shortLabel: 'Transferencia', hint: 'SPEI, PSE, ACH…' },
  { value: 'debit_card', icon: '💳', label: 'Tarjeta de débito', shortLabel: 'T. Débito', hint: 'Cobro inmediato' },
  { value: 'credit_card', icon: '💳', label: 'Tarjeta de crédito', shortLabel: 'T. Crédito', hint: 'Pago mensual' },
  { value: 'bank_account', icon: '🏦', label: 'Cuenta bancaria', shortLabel: 'Cuenta', hint: 'Cargo directo' },
  { value: 'cash', icon: '💵', label: 'Efectivo', shortLabel: 'Efectivo', hint: 'Ventanilla' },
  { value: 'other', icon: '➕', label: 'Otro', shortLabel: 'Otro', hint: '' },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, { icon: string; label: string }> =
  Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, { icon: m.icon, label: m.label }])) as Record<
    PaymentMethod,
    { icon: string; label: string }
  >;

const PAYMENT_METHOD_VALUES: ReadonlySet<string> = new Set(PAYMENT_METHODS.map((m) => m.value));

/** Validate an unknown value against the allowed payment methods (safe for server routes). */
export function normalizePaymentMethod(value: unknown): PaymentMethod | null {
  return typeof value === 'string' && PAYMENT_METHOD_VALUES.has(value) ? (value as PaymentMethod) : null;
}

const BANK_METHODS = new Set<PaymentMethod>(['transfer', 'debit_card', 'credit_card', 'bank_account']);
const CARD_METHODS = new Set<PaymentMethod>(['debit_card', 'credit_card']);

/** Whether the method needs a bank/issuer + account identifier. */
export function methodNeedsBank(method: PaymentMethod | null | undefined): boolean {
  return method != null && BANK_METHODS.has(method);
}

/** Whether the method is a physical card (only last 4 digits are ever stored). */
export function isCardMethod(method: PaymentMethod | null | undefined): boolean {
  return method != null && CARD_METHODS.has(method);
}

/** Label for the issuer/entity field, depending on the method. */
export function bankFieldLabel(method: PaymentMethod | null | undefined): string {
  return isCardMethod(method) ? 'Emisor de la tarjeta' : 'Banco / entidad';
}

/** Keep only digits and cap to the last 4 — enforces the "last 4 only" rule. */
export function toLast4(raw: string): string {
  return raw.replaceAll(/\D/g, '').slice(-4);
}

/** Render a masked identifier showing only the last 4 digits, e.g. "•••• 1234". */
export function maskLast4(last4: string | null | undefined): string {
  const digits = (last4 ?? '').replaceAll(/\D/g, '').slice(-4);
  return digits ? `•••• ${digits}` : '';
}

/** Human-readable one-line summary of a default payment method. */
export function describePaymentMethod(
  method: PaymentMethod | null | undefined,
  bankName: string | null | undefined,
  accountLast4: string | null | undefined,
): string {
  if (!method) return '';
  const label = PAYMENT_METHOD_LABELS[method]?.label ?? '';
  const parts: string[] = [];
  if (bankName?.trim()) parts.push(bankName.trim());
  const masked = maskLast4(accountLast4);
  if (masked) parts.push(masked);
  return parts.length ? `${label} · ${parts.join(' · ')}` : label;
}
