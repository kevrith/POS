import { describe, expect, it } from 'vitest';
import { createAttemptKeys } from '../checkoutKey';

describe('checkout attempt keys', () => {
  it('keeps one key while the same sale is retried', () => {
    const keys = createAttemptKeys();
    const first = keys.keyFor('cart-A');
    expect(keys.keyFor('cart-A')).toBe(first);
  });

  it('issues a new key when the sale changes, so a different sale never replays an old one', () => {
    const keys = createAttemptKeys();
    expect(keys.keyFor('cart-A')).not.toBe(keys.keyFor('cart-B'));
  });

  it('issues a new key after a completed sale', () => {
    const keys = createAttemptKeys();
    const first = keys.keyFor('cart-A');
    keys.reset();
    expect(keys.keyFor('cart-A')).not.toBe(first);
  });

  it('produces keys the server accepts (8-64 chars of A-Za-z0-9_-)', () => {
    const keys = createAttemptKeys();
    for (let i = 0; i < 20; i++) expect(keys.keyFor(`s${i}`)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
