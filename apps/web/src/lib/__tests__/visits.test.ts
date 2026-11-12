import { describe, expect, it } from 'vitest';
import { bmi, vitalFlags, waitLabel, type VisitDetail } from '../clinical';
import { esc, referralLetterHtml, sickNoteHtml } from '../visitPrint';

describe('vitalFlags', () => {
  it('flags what is outside the adult range, with a level', () => {
    const f = vitalFlags({ temperatureC: 39.8, pulse: 105, spo2: 88, systolic: 150, diastolic: 95, respiratoryRate: 18 }, 40);
    expect(f.find((x) => x.field === 'temperatureC')?.level).toBe('ALERT');
    expect(f.find((x) => x.field === 'pulse')?.level).toBe('WARN');
    expect(f.find((x) => x.field === 'spo2')?.level).toBe('ALERT');
    expect(f.find((x) => x.field === 'bp')?.text).toBe('High blood pressure 150/95');
    expect(f.find((x) => x.field === 'respiratoryRate')).toBeUndefined();
  });
  it('says nothing for a normal set, a missing reading or a child', () => {
    expect(vitalFlags({ temperatureC: 36.8, pulse: 72, spo2: 98, systolic: 118, diastolic: 76 }, 30)).toEqual([]);
    expect(vitalFlags({}, 30)).toEqual([]);
    expect(vitalFlags({ pulse: 140, temperatureC: 40 }, 6)).toEqual([]);
  });
  it('a blood pressure is judged only when both numbers are there', () => {
    expect(vitalFlags({ systolic: 190 }, 50)).toEqual([]);
  });
});

describe('bmi and waiting', () => {
  it('works out BMI to one decimal, or nothing', () => {
    expect(bmi(70, 175)).toBe(22.9);
    expect(bmi(null, 175)).toBeNull();
    expect(bmi(70, undefined)).toBeNull();
  });
  it('reads a wait as minutes or hours', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    expect(waitLabel('2026-11-12T09:48:00Z', now)).toBe('12 min');
    expect(waitLabel('2026-11-12T08:55:00Z', now)).toBe('1 h 5 min');
    expect(waitLabel('2026-11-12T10:30:00Z', now)).toBe('0 min');
  });
});

const visit = (o: Partial<VisitDetail> = {}): VisitDetail => ({
  id: 'v', visitNumber: 'V-20261112-001', status: 'COMPLETED', priority: 'NORMAL', complaint: 'Fever and cough', doctorId: 'd', doctorName: 'Dr Doe', createdAt: '2026-11-12T07:00:00Z', patientId: 'p',
  invoicing: false, storeId: 's',
  patient: { id: 'p', patientNumber: 'PT-0001', name: 'Jane <b>Doe</b>', phone: null, email: null, dateOfBirth: null, ageYears: 34, sex: 'F', idNumber: '12345678', address: null, allergies: [{ substance: 'Penicillin' }], conditions: [], weightKg: 60, pregnant: false, breastfeeding: false, bloodGroup: null, nextOfKinName: null, nextOfKinPhone: null, insuranceProviderId: null, insuranceMemberNumber: null, notes: null, isActive: true },
  temperatureC: 38.2, pulse: 96, respiratoryRate: null, systolic: 120, diastolic: 80, spo2: 97, weightKg: 60, heightCm: null, bloodSugarMmol: null, painScore: null, triageNotes: null, triagedBy: null, consultStartedAt: '2026-11-12T07:30:00Z',
  subjective: null, objective: null, assessment: null, plan: null, diagnoses: [{ code: 'J06.9', label: 'URTI' }],
  sickLeaveDays: 3, sickLeaveNote: null, referralTo: 'County Referral Hospital', referralNote: 'For a chest X-ray', followUpDate: null, saleId: null, cancelReason: null, completedAt: '2026-11-12T08:10:00Z',
  charges: [], totalCents: 0, prescriptions: [],
  ...o,
});

describe('printed documents', () => {
  it('escapes markup in a name', () => {
    expect(esc('<script>x</script> & "q"')).toBe('&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;');
    expect(sickNoteHtml('Clinic', visit())).not.toContain('<b>Doe</b>');
  });

  it('a sick note says how many days and from when to when, and leaves the illness out', () => {
    const html = sickNoteHtml('Premier Clinic', visit())!;
    expect(html).toContain('Premier Clinic');
    expect(html).toContain('3 days');
    expect(html).toContain('12 November 2026');
    expect(html).toContain('14 November 2026');
    expect(html).not.toContain('URTI');
    expect(html).toContain('Dr Doe');
  });

  it('there is no sick note without sick leave', () => {
    expect(sickNoteHtml('C', visit({ sickLeaveDays: null }))).toBeNull();
  });

  it('a referral carries who, why, vitals, diagnosis and allergies', () => {
    const html = referralLetterHtml('Premier Clinic', visit())!;
    for (const part of ['County Referral Hospital', 'Fever and cough', 'Temperature 38.2', 'BP 120/80', 'J06.9', 'Penicillin', 'For a chest X-ray', '34 years']) expect(html).toContain(part);
    expect(referralLetterHtml('C', visit({ referralTo: null }))).toBeNull();
  });
});
