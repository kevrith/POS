import { describe, expect, it } from 'vitest';
import { diagnosesCsv, formatMinutes, presetRange } from '../clinicReports';

describe('presetRange', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  it('gives Nairobi days', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-11-12', to: '2026-11-12' });
    expect(presetRange('7d', now)).toEqual({ from: '2026-11-06', to: '2026-11-12' });
    expect(presetRange('30d', now)).toEqual({ from: '2026-10-14', to: '2026-11-12' });
    expect(presetRange('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-12' });
  });
  it('uses the Nairobi date even late in the evening UTC', () => {
    expect(presetRange('today', new Date('2026-11-12T22:00:00Z')).to).toBe('2026-11-13');
  });
});

describe('formatMinutes', () => {
  it('reads naturally', () => {
    expect(formatMinutes(null)).toBe('-');
    expect(formatMinutes(12.4)).toBe('12 min');
    expect(formatMinutes(65)).toBe('1 h 5 min');
  });
});

describe('diagnosesCsv', () => {
  const row = { key: 'k', code: 'B54', icd11: '1F40', label: 'Malaria, unspecified', total: 5, under5: 2, fiveAndOver: 3, unknownAge: 0 };
  it('writes a header and quotes what needs it', () => {
    const csv = diagnosesCsv([row]).split('\r\n');
    expect(csv[0]).toBe('ICD-10,ICD-11,Diagnosis,Visits,Under 5,5 and over,Age unknown');
    expect(csv[1]).toBe('B54,1F40,"Malaria, unspecified",5,2,3,0');
  });
  it('defuses a diagnosis typed to look like a spreadsheet formula', () => {
    const csv = diagnosesCsv([{ ...row, code: null, icd11: null, label: '=HYPERLINK("http://evil","x")' }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv.split('\r\n')[1].startsWith(',,')).toBe(true);
  });
});
