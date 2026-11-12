import { describe, expect, it } from 'vitest';
import { claimSummaryHtml } from '../claimPrint';
import type { ClaimDetail } from '../cover';

const claim: ClaimDetail = {
  id: 'c1', claimNumber: 'CL-9', status: 'SUBMITTED', providerId: 'sha', providerName: 'Social Health Authority', providerKind: 'SHA',
  patientId: 'p1', patientName: 'Jane <b>Doe</b>', memberNumber: 'SHA-123', visitId: 'v1', prescriptionId: null, saleId: 's1',
  billedCents: 64000, approvedCents: 0, paidCents: 0, copayPct: 20, preauthNumber: null, rejectionReason: null,
  submittedAt: '2026-11-12T09:00:00Z', paidAt: null, ageDays: 3, problems: [],
  lines: [{ name: 'Consultation', quantity: 1, unitPriceCents: 50000, totalCents: 50000 }, { name: 'Malaria test', quantity: 1, unitPriceCents: 30000, totalCents: 30000 }],
  diagnoses: [{ label: 'Malaria', code: 'B54', icd11: '1F40' }],
};

describe('claimSummaryHtml', () => {
  it('lays out the patient, cover, both diagnosis codes, lines and the amount claimed', () => {
    const html = claimSummaryHtml('Test Clinic', claim);
    for (const part of ['Test Clinic', 'CL-9', 'SHA-123', 'B54', '1F40', 'Consultation', 'Malaria test', 'Social Health Authority']) expect(html).toContain(part);
    expect(html).toContain('KES');
  });

  it('keeps markup in a name inert', () => {
    const html = claimSummaryHtml('Clinic', claim);
    expect(html).not.toContain('<b>Doe</b>');
    expect(html).toContain('&lt;b&gt;Doe&lt;/b&gt;');
  });
});
