/** Maps a payment_records SQL row to the camelCase API shape. */
export function mapRecord(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    paymentId: String(r.payment_id),
    month: Number(r.month),
    year: Number(r.year),
    paidAt: r.paid_at ? new Date(r.paid_at as string).toISOString() : null,
    amount: Number.parseFloat(String(r.amount)),
    actualAmount: r.actual_amount == null ? null : Number.parseFloat(String(r.actual_amount)),
    paymentMethod: (r.payment_method as string | null) ?? null,
    bankAccount: (r.bank_account as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: String(r.status),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}
