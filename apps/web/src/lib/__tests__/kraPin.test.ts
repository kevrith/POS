import { describe, expect, it } from 'vitest';
import { isValidKraPin } from '../kraPin';

describe('isValidKraPin', () => {
  it('accepts an individual and a company PIN, in any case, with stray spaces', () => {
    expect(isValidKraPin('A012345678Z')).toBe(true);
    expect(isValidKraPin('p051234567x')).toBe(true);
    expect(isValidKraPin(' P051234567Z ')).toBe(true);
  });
  it('refuses anything else', () => {
    for (const bad of ['', 'A12345678Z', 'B012345678Z', 'A0123456789', 'A012345678', '012345678Z', 'A01234567ZZ']) expect(isValidKraPin(bad), bad).toBe(false);
  });
});
