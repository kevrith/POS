import { describe, expect, it } from 'vitest';
import { flagClass, needsAck, noSpecimen, orderHasCritical, rangeText, type LabItem, type LabOrder } from '../lab';
import { labReportHtml, specimenLabelHtml } from '../labPrint';

const hb = { name: 'Haemoglobin', kind: 'NUMERIC' as const, unit: 'g/dL', low: 13, high: 17, lowF: 12, highF: 15 };
const item = (o: Partial<LabItem> = {}): LabItem => ({
  id: 'i1', orderId: 'o1', testId: 't1', testName: 'Haemoglobin', specimen: 'BLOOD', status: 'VERIFIED', parameters: [hb],
  results: [{ name: 'Haemoglobin', value: '11.2', unit: 'g/dL', low: 12, high: 15, flag: 'LOW' }], comment: null, hasCritical: false,
  resultedBy: 'Lilian', resultedById: 'u1', resultedAt: '2026-11-12T10:00:00Z', verifiedBy: 'Moses', verifiedAt: '2026-11-12T10:30:00Z', amendedNote: null, criticalAckAt: null, criticalAckBy: null, ...o,
});
const order = (items: LabItem[], o: Partial<LabOrder> = {}): LabOrder => ({
  id: 'o1', orderNumber: 'L-20261112-001', status: 'VERIFIED', priority: 'NORMAL', clinicalNotes: null, visitId: 'v1', visitNumber: 'V-1', orderedByName: 'Dr <i>Doe</i>',
  collectedByName: 'Lilian', collectedAt: '2026-11-12T09:30:00Z', cancelReason: null, createdAt: '2026-11-12T09:00:00Z',
  patient: { id: 'p1', name: 'Jane <b>Doe</b>', patientNumber: 'PT-0001', sex: 'F', ageYears: 34 }, items, ...o,
});

describe('rangeText', () => {
  it('shows the range that applies to the patient', () => {
    expect(rangeText(hb, 'F')).toBe('12 - 15 g/dL');
    expect(rangeText(hb, 'M')).toBe('13 - 17 g/dL');
    expect(rangeText({ name: 'CRP', kind: 'NUMERIC', unit: 'mg/L', high: 5 }, null)).toBe('up to 5 mg/L');
    expect(rangeText({ name: 'R', kind: 'CHOICE', choices: ['a', 'b'] }, null)).toBe('');
  });
});

describe('flagClass', () => {
  it('critical is loudest, other abnormal amber, normal plain', () => {
    expect(flagClass('CRITICAL_LOW')).toContain('red');
    expect(flagClass('HIGH')).toContain('amber');
    expect(flagClass('ABNORMAL')).toContain('amber');
    expect(flagClass('NORMAL')).toBe('');
    expect(flagClass(null)).toBe('');
  });
});

describe('orderHasCritical', () => {
  it('counts only entered results', () => {
    expect(orderHasCritical(order([item({ hasCritical: true })]))).toBe(true);
    expect(orderHasCritical(order([item({ hasCritical: true, status: 'PENDING' })]))).toBe(false);
    expect(orderHasCritical(order([item()]))).toBe(false);
  });
});

describe('labReportHtml', () => {
  it('prints released results with flags, and keeps markup in names inert', () => {
    const html = labReportHtml('Test Clinic', order([item()]))!;
    for (const part of ['Test Clinic', 'L-20261112-001', 'Haemoglobin', '11.2', 'Low', 'Lilian', 'Moses']) expect(html).toContain(part);
    expect(html).not.toContain('<b>Doe</b>');
    expect(html).not.toContain('<i>Doe</i>');
    expect(html).toContain('&lt;b&gt;Doe&lt;/b&gt;');
  });

  it('prints nothing until a result is released', () => {
    expect(labReportHtml('C', order([item({ status: 'RESULTED' })]))).toBeNull();
    expect(labReportHtml('C', order([]))).toBeNull();
  });
});

describe('children, acknowledgement and imaging', () => {
  const child = { name: 'Haemoglobin', kind: 'NUMERIC' as const, unit: 'g/dL', low: 13, high: 17, lowC: 11.5, highC: 15.5 };
  it('shows the child range under 12 and the adult one otherwise', () => {
    expect(rangeText(child, 'M', 7)).toBe('11.5 - 15.5 g/dL');
    expect(rangeText(child, 'M', 12)).toBe('13 - 17 g/dL');
    expect(rangeText(child, 'M', null)).toBe('13 - 17 g/dL');
  });

  it('a critical result needs acknowledging until a clinician has seen it', () => {
    expect(needsAck(item({ hasCritical: true }))).toBe(true);
    expect(needsAck(item({ hasCritical: true, criticalAckAt: '2026-11-12T11:00:00Z', criticalAckBy: 'Dr Doe' }))).toBe(false);
    expect(needsAck(item({ hasCritical: true, status: 'PENDING' }))).toBe(false);
    expect(needsAck(item())).toBe(false);
  });

  it('imaging takes no specimen, so it has no specimen label', () => {
    const xray = item({ testName: 'Chest X-ray', specimen: 'NONE' });
    expect(noSpecimen(order([xray]))).toBe(true);
    expect(noSpecimen(order([xray, item()]))).toBe(false);
    expect(specimenLabelHtml(order([xray]))).toBeNull();
  });

  it('a specimen label names the patient, the order and the tests, and keeps markup inert', () => {
    const html = specimenLabelHtml(order([item()]))!;
    for (const part of ['PT-0001', 'L-20261112-001', 'Haemoglobin', 'blood']) expect(html).toContain(part);
    expect(html).not.toContain('<b>Doe</b>');
  });
});
