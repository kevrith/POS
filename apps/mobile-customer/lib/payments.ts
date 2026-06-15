import { apiGet, apiPost } from './api';

export interface StkInitResult {
  checkoutRequestId: string;
  merchantRequestId: string;
}
export interface StkStatus {
  status: 'pending' | 'paid' | 'failed';
  resultDesc: string;
}

/** Trigger an M-Pesa STK prompt to the customer's phone for the order total. */
export function initiateStk(phone: string, amountCents: number, reference: string): Promise<StkInitResult> {
  return apiPost<StkInitResult>('/portal/pay-order', { phone, amountCents, reference });
}

/** Poll the STK result once. */
export function getStkStatus(checkoutRequestId: string): Promise<StkStatus> {
  return apiGet<StkStatus>(`/portal/pay-status/${checkoutRequestId}`);
}

/**
 * Poll STK status until it settles or times out. Resolves with the final status
 * ('paid' / 'failed') or 'pending' if the customer never acted within the window.
 */
export async function pollStkUntilDone(
  checkoutRequestId: string,
  { intervalMs = 3000, timeoutMs = 60000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<StkStatus['status']> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await getStkStatus(checkoutRequestId);
      if (res.status === 'paid' || res.status === 'failed') return res.status;
    } catch {
      /* transient — keep polling */
    }
  }
  return 'pending';
}
