/**
 * The eTIMS payment type code for a sale, from how it was paid. KRA takes one code per invoice, so a sale paid in
 * several ways gets the one that fits best.
 *
 *   01 cash   02 credit   03 cash and credit   04 bank cheque/transfer   05 card   06 mobile money   07 other
 *
 * Credit means money still owed to the business: a credit sale, an insurer's share of a prescription, a sale charged
 * to a hotel room. A deposit the guest paid earlier, a gift card and loyalty points are "other". A sale part paid and
 * part owed is 03. Otherwise the way that took the most money decides.
 */
export const ETIMS_PAYMENT = { CASH: '01', CREDIT: '02', CASH_AND_CREDIT: '03', BANK: '04', CARD: '05', MOBILE: '06', OTHER: '07' } as const;

const CREDIT_METHODS = ['CREDIT', 'INSURANCE', 'ROOM_CHARGE'];

function kindOf(method: string): string {
  const m = String(method ?? '').toUpperCase();
  if (CREDIT_METHODS.includes(m)) return ETIMS_PAYMENT.CREDIT;
  if (m === 'GIFT_CARD') return ETIMS_PAYMENT.OTHER;
  if (m.includes('MPESA') || m.includes('MOBILE')) return ETIMS_PAYMENT.MOBILE;
  if (m.includes('CARD') || m.includes('PAYSTACK')) return ETIMS_PAYMENT.CARD;
  if (m.includes('BANK') || m.includes('TRANSFER') || m.includes('CHEQUE')) return ETIMS_PAYMENT.BANK;
  if (m === 'CASH') return ETIMS_PAYMENT.CASH;
  return ETIMS_PAYMENT.OTHER;
}

export function etimsPaymentType(payments: Array<{ method?: string; paymentMethod?: string; amountCents?: number }>, isCreditSale = false): string {
  if (!payments?.length) return isCreditSale ? ETIMS_PAYMENT.CREDIT : ETIMS_PAYMENT.CASH;
  const byKind = new Map<string, number>();
  for (const p of payments) {
    const kind = kindOf(p.method ?? p.paymentMethod ?? '');
    byKind.set(kind, (byKind.get(kind) ?? 0) + (p.amountCents ?? 0));
  }
  const kinds = [...byKind.keys()];
  if (kinds.length === 1) return kinds[0];
  const hasCredit = byKind.has(ETIMS_PAYMENT.CREDIT);
  // Credit alongside money actually received.
  if (hasCredit) return ETIMS_PAYMENT.CASH_AND_CREDIT;
  return [...byKind.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
