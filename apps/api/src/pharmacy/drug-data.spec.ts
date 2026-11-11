import { drugData } from './drug-data';

describe('drugData', () => {
  it('needs a generic name to create, and none to edit', () => {
    expect(() => drugData({}, true)).toThrow(/Generic name/);
    expect(drugData({ strength: ' 500mg ' }, false)).toEqual({ strength: '500mg' });
    expect(() => drugData({}, false)).toThrow(/Nothing to change/);
  });

  it('takes form and schedule in any case, refuses unknown ones', () => {
    expect(drugData({ genericName: 'Amoxicillin', dosageForm: 'capsule', scheduleClass: 'ii' }, true)).toMatchObject({ dosageForm: 'CAPSULE', scheduleClass: 'II' });
    expect(() => drugData({ genericName: 'X', dosageForm: 'bucket' }, true)).toThrow(/Dosage form/);
    expect(() => drugData({ genericName: 'X', scheduleClass: 'IX' }, true)).toThrow(/Schedule/);
  });

  it('keeps the dose limit as a positive number with a unit, and a blank clears it', () => {
    expect(drugData({ genericName: 'Paracetamol', maxDailyDose: '4000' }, true)).toMatchObject({ maxDailyDose: 4000, unit: 'mg' });
    expect(drugData({ maxDailyDose: 4, unit: 'g' }, false)).toEqual({ maxDailyDose: 4, unit: 'g' });
    expect(drugData({ maxDailyDose: '' }, false)).toEqual({ maxDailyDose: null });
    expect(() => drugData({ maxDailyDose: -1 }, false)).toThrow(/Maximum daily dose/);
    expect(() => drugData({ maxDailyDose: 5, unit: 'litres' }, false)).toThrow(/Dose unit/);
  });

  it('never carries the business or id from the body', () => {
    expect(drugData({ genericName: 'X', businessId: 'other', id: 'x' } as any, true)).toEqual({ genericName: 'X' });
  });
});
