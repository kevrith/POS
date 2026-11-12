import { cleanParameters } from './lab-results';
import { STARTER_TESTS } from './starter-tests';

describe('starter tests', () => {
  it('every test has valid parameters and a unique name and code', () => {
    for (const t of STARTER_TESTS) expect(() => cleanParameters(t.parameters)).not.toThrow();
    expect(new Set(STARTER_TESTS.map((t) => t.name.toLowerCase())).size).toBe(STARTER_TESTS.length);
    expect(new Set(STARTER_TESTS.map((t) => t.code)).size).toBe(STARTER_TESTS.length);
  });
});
