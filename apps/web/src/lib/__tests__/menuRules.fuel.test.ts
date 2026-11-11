import { describe, expect, it } from 'vitest';
import { menuVisible } from '../menuRules';

const has = (mode: string, path: string, role?: string) => menuVisible(path, { posMode: mode, enabledModules: [], role });

describe('what a fuel station sees', () => {
  it('has its forecourt and a till for the shop, lubricants and LPG', () => {
    expect(has('FUEL_PUMP', '/fuel-pump')).toBe(true);
    expect(has('FUEL_PUMP', '/shop-till')).toBe(true);
  });

  it('keeps stock, suppliers and money tools a station uses', () => {
    for (const path of ['/inventory', '/suppliers', '/stocktake', '/damaged-goods', '/expenses', '/cash-drawer', '/reports', '/customers']) {
      expect(has('FUEL_PUMP', path), path).toBe(true);
    }
  });

  it('hides tools a station has no use for', () => {
    for (const path of ['/bundle', '/rfq', '/forecasting', '/gift-cards']) expect(has('FUEL_PUMP', path), path).toBe(false);
  });

  it('other kinds of business do not get the shop till, and still get what the station hides', () => {
    for (const mode of ['RETAIL', 'SUPERMARKET', 'HOSPITALITY', 'SALON', 'CLINIC']) expect(has(mode, '/shop-till'), mode).toBe(false);
    for (const path of ['/bundle', '/rfq', '/forecasting', '/gift-cards']) expect(has('RETAIL', path), path).toBe(true);
  });
});
