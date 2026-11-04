/**
 * Idempotency key for a checkout ATTEMPT.
 *
 * The server records a sale once per key (`POST /sales/checkout`, `offlineId`). When the response to a checkout
 * is lost (timeout, Wi-Fi drop) the cashier presses Pay again; with the same key the server returns the sale it
 * already recorded instead of creating a second one. The key is kept while the sale stays the same and replaced
 * as soon as the cart or payment changes, or the sale completes, so a different sale can never replay an old one.
 */
function randomKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

export interface AttemptKeys {
  /** The key for a sale with this signature (any stable string describing the cart and payments). */
  keyFor(signature: string): string;
  /** Forget the current key: the sale went through, so the next one starts fresh. */
  reset(): void;
}

export function createAttemptKeys(): AttemptKeys {
  let current: { key: string; signature: string } | null = null;
  return {
    keyFor(signature) {
      if (!current || current.signature !== signature) current = { key: randomKey(), signature };
      return current.key;
    },
    reset() {
      current = null;
    },
  };
}
