/**
 * A folio line that is a sale already rung up at a till and charged to the guest's room. It was invoiced (and taxed)
 * as that sale, so check-out only collects it: it is never billed again on the stay's invoice.
 */
export const ROOM_CHARGE_FOLIO_TYPE = 'POS_SALE';

export interface Tender { method: string; amountCents: number }

/**
 * Divide the money a guest hands over between what they owe the hotel for sales charged to their room (money in
 * against the receivable) and what the stay's own invoice needs. Each tender is spent on the receivable first, then
 * on the invoice; whatever is left over is the guest's change.
 */
export function splitTenders(sources: Tender[], receivableCents: number, invoiceCents: number) {
  const receivable: Tender[] = [];
  const invoice: Tender[] = [];
  const change: Tender[] = [];
  let needReceivable = Math.max(0, receivableCents);
  let needInvoice = Math.max(0, invoiceCents);
  for (const s of sources) {
    let left = s.amountCents;
    const toReceivable = Math.min(left, needReceivable);
    if (toReceivable > 0) receivable.push({ method: s.method, amountCents: toReceivable });
    needReceivable -= toReceivable;
    left -= toReceivable;
    const toInvoice = Math.min(left, needInvoice);
    if (toInvoice > 0) invoice.push({ method: s.method, amountCents: toInvoice });
    needInvoice -= toInvoice;
    left -= toInvoice;
    if (left > 0) change.push({ method: s.method, amountCents: left });
  }
  return { receivable, invoice, change };
}

/** One entry per method, so a tender spread over several purposes reads as the single payment it was. */
export function mergeByMethod(tenders: Tender[]): Tender[] {
  const out = new Map<string, number>();
  for (const t of tenders) out.set(t.method, (out.get(t.method) ?? 0) + t.amountCents);
  return [...out].map(([method, amountCents]) => ({ method, amountCents }));
}
