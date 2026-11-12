import { describe, expect, it } from 'vitest';
import { menuVisible } from '../menuRules';

const has = (mode: string, path: string) => menuVisible(path, { posMode: mode, enabledModules: [], role: 'OWNER' });

describe('what a clinic or pharmacy sees', () => {
  it('has its patients, prescriptions, pharmacy tools and batches', () => {
    for (const path of ['/visits', '/patients', '/prescriptions', '/pharmacy', '/appointments', '/batch']) expect(has('CLINIC', path), path).toBe(true);
  });

  it('other kinds of business do not see patients', () => {
    for (const mode of ['RETAIL', 'SUPERMARKET', 'HOSPITALITY', 'SALON', 'FUEL_PUMP', 'CYBERCAFE']) { expect(has(mode, '/patients'), mode).toBe(false); expect(has(mode, '/visits'), mode).toBe(false); }
  });
});
