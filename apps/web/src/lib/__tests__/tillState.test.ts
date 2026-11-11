import { describe, expect, it } from 'vitest';
import { tillStateFor } from '../../lib/mainTill';

describe('which till is shown', () => {
  it('waits while there is nothing to go on', () => {
    expect(tillStateFor(undefined, true)).toBe('loading');
  });

  it('does not guess a shop till when the settings could not be read', () => {
    expect(tillStateFor(undefined, false)).toBe('unknown');
  });

  it("shows the business's own till, and the shop till only when it has no kind set", () => {
    expect(tillStateFor({ posMode: 'FUEL_PUMP' }, false)).toBe('FUEL_PUMP');
    expect(tillStateFor({ posMode: 'CLINIC' }, true)).toBe('CLINIC');
    expect(tillStateFor({ posMode: null }, false)).toBe('RETAIL');
    expect(tillStateFor({}, false)).toBe('RETAIL');
  });
});
