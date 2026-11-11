import { cleanMedicine } from './item-medicine';

describe('cleanMedicine', () => {
  it('writes only what was sent', () => {
    expect(cleanMedicine({})).toEqual({});
    expect(cleanMedicine({ strength: ' 500mg ' })).toEqual({ strength: '500mg' });
  });

  it('clears a field with blank or null', () => {
    expect(cleanMedicine({ genericName: '', drugClass: null, scheduleClass: '' })).toEqual({ genericName: null, drugClass: null, scheduleClass: null });
  });

  it('takes the schedule in any case and refuses an unknown one', () => {
    expect(cleanMedicine({ scheduleClass: 'ii' })).toEqual({ scheduleClass: 'II' });
    expect(cleanMedicine({ scheduleClass: 'otc' })).toEqual({ scheduleClass: 'OTC' });
    expect(() => cleanMedicine({ scheduleClass: 'VII' })).toThrow(/Schedule/);
  });

  it('prescription-only is a plain yes or no', () => {
    expect(cleanMedicine({ requiresPrescription: true })).toEqual({ requiresPrescription: true });
    expect(cleanMedicine({ requiresPrescription: 'yes' as any })).toEqual({ requiresPrescription: false });
  });

  it('refuses an over-long name', () => {
    expect(() => cleanMedicine({ genericName: 'x'.repeat(101) })).toThrow(/Generic name is too long/);
  });
});
