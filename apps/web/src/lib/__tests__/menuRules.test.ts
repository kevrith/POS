import { describe, expect, it } from 'vitest';
import { MENU_RULES, menuVisible } from '../menuRules';

const MODES = ['RETAIL', 'SUPERMARKET', 'HOSPITALITY', 'FAST_FOOD', 'BAR_TAB', 'FUEL_PUMP', 'CYBERCAFE', 'CLINIC', 'SALON'] as const;
const seen = (mode: string, modules: string[] = [], role?: string) =>
  Object.keys(MENU_RULES).filter((p) => menuVisible(p, { posMode: mode, enabledModules: modules, role }));
const has = (mode: string, path: string, modules: string[] = [], role?: string) => menuVisible(path, { posMode: mode, enabledModules: modules, role });

const FIELD_SALES = ['/field-orders', '/delivery-routes', '/agent'];
const DELIVERY = ['/delivery', '/online-orders', '/delivery-management'];

describe('what each kind of business sees by default', () => {
  it('a salon does not see field sales, delivery, quotes or shop-only tools (the report)', () => {
    for (const path of [...FIELD_SALES, ...DELIVERY, '/proforma', '/layaway', '/serial', '/kds', '/hospitality', '/hotel', '/fuel-pump', '/cybercafe', '/prescriptions']) {
      expect(has('SALON', path), `${path} for SALON`).toBe(false);
    }
    expect(has('SALON', '/appointments')).toBe(true);
  });

  it('a hospitality business (table service, hotel) does not see field sales, delivery or quotes, but keeps its own tools', () => {
    for (const path of [...FIELD_SALES, ...DELIVERY, '/proforma']) expect(has('HOSPITALITY', path), `${path} for HOSPITALITY`).toBe(false);
    for (const path of ['/kds', '/waitlist', '/recipe', '/hotel', '/channel-manager']) expect(has('HOSPITALITY', path), `${path} for HOSPITALITY`).toBe(true);
  });

  it('a shop and a supermarket keep delivery, field sales and quotes', () => {
    for (const mode of ['RETAIL', 'SUPERMARKET']) {
      for (const path of [...FIELD_SALES, ...DELIVERY, '/proforma', '/layaway']) expect(has(mode, path), `${path} for ${mode}`).toBe(true);
    }
  });

  it('a takeaway keeps delivery but has no field sales or quotes', () => {
    for (const path of DELIVERY) expect(has('FAST_FOOD', path)).toBe(true);
    for (const path of [...FIELD_SALES, '/proforma']) expect(has('FAST_FOOD', path)).toBe(false);
  });

  it('fuel, cybercafe, clinic and bar see none of delivery, field sales or quotes', () => {
    for (const mode of ['FUEL_PUMP', 'CYBERCAFE', 'CLINIC', 'BAR_TAB']) {
      for (const path of [...FIELD_SALES, ...DELIVERY, '/proforma']) expect(has(mode, path), `${path} for ${mode}`).toBe(false);
    }
  });

  it('each kind of business keeps the tools that are its own', () => {
    expect(has('CLINIC', '/prescriptions')).toBe(true);
    expect(has('CLINIC', '/pharmacy')).toBe(true);
    expect(has('CLINIC', '/appointments')).toBe(true);
    expect(has('FUEL_PUMP', '/fuel-pump')).toBe(true);
    expect(has('CYBERCAFE', '/cybercafe')).toBe(true);
    expect(has('RETAIL', '/serial')).toBe(true);
    expect(has('BAR_TAB', '/kds')).toBe(true);
  });

  it('entries with no rule are for everyone', () => {
    for (const mode of MODES) expect(has(mode, '/inventory')).toBe(true);
  });
});

describe('switching a feature on', () => {
  it('shows it for any kind of business once the module is on', () => {
    expect(has('SALON', '/proforma', ['QUOTES'])).toBe(true);
    expect(has('HOSPITALITY', '/online-orders', ['DELIVERY'])).toBe(true);
    expect(has('HOSPITALITY', '/delivery', ['DELIVERY'])).toBe(true);
    expect(has('SALON', '/field-orders', ['FIELD_SALES'])).toBe(true);
  });

  it('one module does not switch on another', () => {
    expect(has('HOSPITALITY', '/field-orders', ['DELIVERY'])).toBe(false);
    expect(has('SALON', '/delivery', ['FIELD_SALES'])).toBe(false);
  });

  it('a restaurant module on a shop adds tables and the kitchen display, and a hotel module adds the hotel', () => {
    expect(has('RETAIL', '/hospitality', ['RESTAURANT'])).toBe(true);
    expect(has('RETAIL', '/kds', ['RESTAURANT'])).toBe(true);
    expect(has('RETAIL', '/hotel', ['HOTEL'])).toBe(true);
    // a restaurant till already has tables inside the till: no second "Restaurant Tables" entry
    expect(has('HOSPITALITY', '/hospitality', ['RESTAURANT'])).toBe(false);
  });

  it('a sales agent always sees their own board, whatever the business', () => {
    expect(has('SALON', '/agent', [], 'SALES_AGENT')).toBe(true);
    expect(has('SALON', '/agent', [], 'OWNER')).toBe(false);
  });
});

describe('the whole table', () => {
  it('has no entry that can never be seen: each is visible for some business, with the right modules on', () => {
    const everything = ['RESTAURANT', 'HOTEL', 'DELIVERY', 'FIELD_SALES', 'QUOTES'];
    for (const path of Object.keys(MENU_RULES)) {
      expect(MODES.some((m) => has(m, path, everything)), `${path} is visible for no business at all`).toBe(true);
    }
  });

  it('is case-insensitive about the till name, so a lower-case stored value still works', () => {
    expect(has('salon', '/appointments')).toBe(true);
    expect(has('salon', '/field-orders')).toBe(false);
  });
});
