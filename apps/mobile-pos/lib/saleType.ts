/**
 * The sale type the server needs to see.
 *
 * The server only debits a customer's balance, and only enforces their credit
 * limit, for a sale of type CREDIT. The web till sends CREDIT whenever a credit
 * payment is present; the phone sent NORMAL for everything, so a credit sale
 * rung up on a phone created no receivable and ignored the limit.
 */
export function saleTypeFor(payments: Array<{ method: string }>): 'NORMAL' | 'CREDIT' {
  return payments.some((p) => p.method === 'CREDIT') ? 'CREDIT' : 'NORMAL';
}
