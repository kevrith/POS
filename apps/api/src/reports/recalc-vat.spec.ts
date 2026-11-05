import { recalcVat } from './reports.service';

describe('recalcVat', () => {
  it('leaves a sale taxed line by line exactly as stored', () => {
    // A basket where one line was exempt: 16/116 of the whole would be 4,000, the stored figure is lower.
    expect(recalcVat(2_757, 31_600, 0, true)).toBe(2_757);
    expect(recalcVat(1_600, 31_600, 0, true)).toBe(1_600);
  });

  it('still repairs an older sale stored with the wrong formula', () => {
    // base x 0.16 was stored for a 11,600 sale (1,856); the inclusive figure is 1,600.
    expect(recalcVat(1_856, 11_600, 0, false)).toBe(1_600);
    expect(recalcVat(1_856, 11_600, 0)).toBe(1_600);
  });

  it('never invents VAT for a sale that carried none', () => {
    expect(recalcVat(0, 11_600, 0, false)).toBe(0);
    expect(recalcVat(0, 11_600, 0, true)).toBe(0);
    expect(recalcVat(null, 11_600, 0, true)).toBe(0);
    expect(recalcVat(undefined, 11_600)).toBe(0);
  });
});
