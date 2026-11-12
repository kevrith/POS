import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../csv';
import { controlledCsv, controlledHtml, disposalCsv, patientBundleHtml, type ControlledRegister, type PatientBundle } from '../compliance';

const register: ControlledRegister = {
  period: { from: '2026-11-01', to: '2026-11-30' }, truncated: false,
  entries: [{ date: '2026-11-10T09:00:00Z', itemName: 'Morphine 10mg/ml', scheduleClass: 'II', quantity: 2, unit: 'ml', patientName: 'Jane <b>Doe</b>', patientIdNumber: '123', prescriberName: 'Dr Doe', prescriberLicense: 'L1', dispensedBy: 'Pam', prescriptionNumber: 'RX-0001', notes: null }],
  summary: [{ itemName: 'Morphine 10mg/ml', scheduleClass: 'II', entries: 1, dispensed: 2, onHand: 38 }],
};

describe('csv', () => {
  it('quotes what needs it and defuses formulas, but leaves real negative numbers alone', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell(null)).toBe('');
    expect(toCsv([['a', 1], ['b', null]])).toBe('a,1\r\nb,');
  });
});

describe('registers', () => {
  it('the controlled register CSV has a header and one row per entry, in Nairobi time', () => {
    const lines = controlledCsv(register).split('\r\n');
    expect(lines[0]).toContain('Medicine,Schedule,Quantity');
    expect(lines[1]).toContain('10 Nov 2026,12:00,Morphine 10mg/ml,II,2,ml,');
    expect(lines).toHaveLength(2);
  });

  it('the printed register totals, and keeps markup in a name inert', () => {
    const html = controlledHtml('Test Pharmacy', register);
    expect(html).toContain('Controlled drugs register');
    expect(html).toContain('Pharmacist in charge');
    expect(html).not.toContain('<b>Doe</b>');
    expect(html).toContain('&lt;b&gt;Doe&lt;/b&gt;');
  });

  it('the disposal CSV writes cost in shillings', () => {
    const csv = disposalCsv({ period: { from: 'a', to: 'b' }, truncated: false, totalCostCents: 2500, entries: [{ date: '2026-11-10T09:00:00Z', itemName: 'Amoxicillin', scheduleClass: null, quantity: 5, costCents: 2500, reason: 'EXPIRED', notes: 'Batch L1', submittedBy: 'Pam', authorizedBy: 'Grace' }] });
    expect(csv.split('\r\n')[1]).toContain('Amoxicillin,,5,25.00,EXPIRED,Batch L1,Pam,Grace');
  });
});

describe('patientBundleHtml', () => {
  const bundle: PatientBundle = {
    exportedAt: '2026-11-12T10:00:00Z', exportedBy: 'Grace',
    patient: { name: 'Jane Doe', patientNumber: 'PT-0001', phone: '0711', email: null, dateOfBirth: '1990-04-23T00:00:00Z', sex: 'F', idNumber: '12345678', allergies: [{ substance: 'Penicillin' }], conditions: ['Asthma'], notes: null },
    visits: [{ visitNumber: 'V-1', createdAt: '2026-11-10T09:00:00Z', complaint: 'Fever', doctorName: 'Dr Doe', status: 'COMPLETED', diagnoses: [{ label: 'Malaria', code: 'B54' }], plan: null }],
    prescriptions: [{ prescriptionNumber: 'RX-1', createdAt: '2026-11-10T09:00:00Z', doctorName: 'Dr Doe', status: 'DISPENSED', items: [{ name: 'Artemether' }] }],
    labOrders: [{ orderNumber: 'L-1', createdAt: '2026-11-10T09:00:00Z', items: [{ testName: 'Haemoglobin', status: 'VERIFIED', results: [{ name: 'Haemoglobin', value: '11', unit: 'g/dL', flag: 'LOW' }] }, { testName: 'Pending test', status: 'PENDING', results: [] }] }],
    coverChecks: [], claims: [],
  };
  it('lists the record in readable form, only released lab results', () => {
    const html = patientBundleHtml('Test Clinic', bundle);
    for (const part of ['Jane Doe', 'PT-0001', 'Penicillin', 'Asthma', 'Malaria', 'Artemether', 'Haemoglobin 11 g/dL (low)', 'prepared', 'Grace']) expect(html).toContain(part);
    expect(html).not.toContain('Pending test');
  });
});
