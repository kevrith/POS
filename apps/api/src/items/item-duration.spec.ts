import { cleanDuration } from './item-duration';

describe('cleanDuration', () => {
  it('keeps a sensible number of minutes, rounded', () => {
    expect(cleanDuration(45)).toBe(45);
    expect(cleanDuration('90')).toBe(90);
    expect(cleanDuration(44.6)).toBe(45);
    expect(cleanDuration(5)).toBe(5);
    expect(cleanDuration(720)).toBe(720);
  });

  it('treats empty as "not set", so an edit can clear it', () => {
    expect(cleanDuration(null)).toBeNull();
    expect(cleanDuration('')).toBeNull();
  });

  it('ignores anything that cannot be a duration', () => {
    expect(cleanDuration(undefined)).toBeUndefined();
    expect(cleanDuration('soon')).toBeUndefined();
    expect(cleanDuration(0)).toBeUndefined();
    expect(cleanDuration(4)).toBeUndefined();
    expect(cleanDuration(721)).toBeUndefined();
    expect(cleanDuration(-30)).toBeUndefined();
    expect(cleanDuration(NaN)).toBeUndefined();
  });
});
