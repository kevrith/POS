import { NotFoundException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

const NOW = new Date('2026-11-10T09:00:00Z');

function setup() {
  const p: any = {
    controlledSubstanceLog: { findMany: jest.fn().mockResolvedValue([{ prescriptionId: 'rx-1', itemName: 'Morphine 10mg/ml', scheduleClass: 'II', quantityDispensed: 2, unit: 'ml', patientName: 'Jane', patientIdNumber: '123', prescriberName: 'Dr Doe', prescriberLicense: 'L1', dispensedBy: 'Pam', dispensedAt: NOW, notes: null }]) },
    item: { findMany: jest.fn().mockResolvedValue([{ id: 'i-1', name: 'Morphine 10mg/ml', scheduleClass: 'II' }]) },
    inventoryMovement: { groupBy: jest.fn().mockResolvedValue([{ itemId: 'i-1', _sum: { quantity: 38 } }]) },
    prescription: {
      findMany: jest.fn().mockResolvedValue([{ id: 'rx-1', prescriptionNumber: 'RX-0001', patientName: 'Jane', patientIdNumber: '123', doctorName: 'Dr Doe', doctorLicense: 'L1', items: '[{"name":"Morphine 10mg/ml","qty":2}]', refillsUsed: 0, dispensedBy: 'Pam', lastFillDate: NOW }]),
    },
    damagedGoodsRecord: { findMany: jest.fn().mockResolvedValue([{ createdAt: NOW, item: { name: 'Amoxicillin', scheduleClass: null }, quantity: 5, costCents: 2500, reason: 'EXPIRED', notes: 'Batch L1 manually written off', submittedBy: 'Pam', authorizedBy: 'Grace' }]) },
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pt-1', patientNumber: 'PT-0001', name: 'Jane Doe', allergies: '[]', conditions: '[]', dateOfBirth: null }) },
    visit: { findMany: jest.fn().mockResolvedValue([{ id: 'v-1', diagnoses: '[{"label":"Malaria","code":"B54"}]' }]) },
    labOrder: { findMany: jest.fn().mockResolvedValue([{ id: 'o-1' }]) },
    labOrderItem: { findMany: jest.fn().mockResolvedValue([{ id: 'li-1', orderId: 'o-1', parameters: '[]', results: '[{"name":"Hb","value":"12","flag":"NORMAL"}]' }]) },
    coverCheck: { findMany: jest.fn().mockResolvedValue([{ id: 'c-1' }]) },
    insuranceClaim: { findMany: jest.fn().mockResolvedValue([{ id: 'cl-1', diagnoses: '[]' }]) },
  };
  const audit: any = { createEntry: jest.fn().mockResolvedValue(undefined) };
  return { prisma: p, audit, svc: new ComplianceService(p, audit) };
}

describe('ComplianceService registers', () => {
  it('the controlled register carries prescription numbers and the stock held now', async () => {
    const { svc, prisma } = setup();
    const r = await svc.controlledRegister('biz-1', { from: '2026-11-01', to: '2026-11-30' });
    expect(prisma.controlledSubstanceLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'biz-1', dispensedAt: { gte: new Date('2026-10-31T21:00:00.000Z'), lte: new Date('2026-11-30T20:59:59.999Z') } } }));
    expect(r.entries[0]).toMatchObject({ itemName: 'Morphine 10mg/ml', quantity: 2, prescriptionNumber: 'RX-0001', dispensedBy: 'Pam' });
    expect(r.summary).toEqual([{ itemName: 'Morphine 10mg/ml', scheduleClass: 'II', entries: 1, dispensed: 2, onHand: 38 }]);
    expect(r.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('the dispensing register lists dispensed prescriptions with their medicines', async () => {
    const { svc, prisma } = setup();
    const r = await svc.dispensingRegister('biz-1', { from: '2026-11-01', to: '2026-11-30' });
    expect(prisma.prescription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-1', status: 'DISPENSED' }) }));
    expect(r.entries[0]).toMatchObject({ prescriptionNumber: 'RX-0001', medicines: 'Morphine 10mg/ml x 2', fills: 1, prescriberLicense: 'L1' });
  });

  it('the disposal register totals approved write-offs only', async () => {
    const { svc, prisma } = setup();
    const r = await svc.disposalRegister('biz-1', {});
    expect(prisma.damagedGoodsRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-1', status: 'APPROVED' }) }));
    expect(r.totalCostCents).toBe(2500);
    expect(r.entries[0]).toMatchObject({ itemName: 'Amoxicillin', reason: 'EXPIRED', authorizedBy: 'Grace' });
  });

  it('refuses a bad period before querying', async () => {
    const { svc, prisma } = setup();
    await expect(svc.controlledRegister('biz-1', { from: '2026-12-05', to: '2026-12-01' })).rejects.toThrow(/after the end/);
    expect(prisma.controlledSubstanceLog.findMany).not.toHaveBeenCalled();
  });
});

describe('ComplianceService.patientExport', () => {
  it('gathers the whole record, parsed, and puts who took it on the audit log', async () => {
    const { svc, audit } = setup();
    const b: any = await svc.patientExport('biz-1', 'pt-1', { id: 'u-1', name: 'Grace' });
    expect(b.patient.name).toBe('Jane Doe');
    expect(b.visits[0].diagnoses).toEqual([{ label: 'Malaria', code: 'B54' }]);
    expect(b.prescriptions[0].items).toEqual([{ name: 'Morphine 10mg/ml', qty: 2 }]);
    expect(b.labOrders[0].items[0].results).toEqual([{ name: 'Hb', value: '12', flag: 'NORMAL' }]);
    expect(b.exportedBy).toBe('Grace');
    expect(b.coverChecks).toHaveLength(1);
    expect(b.claims).toHaveLength(1);
    expect(audit.createEntry).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', actor: 'u-1', action: 'PATIENT_DATA_EXPORT', entity: 'Patient', entityId: 'pt-1' }));
  });

  it('is scoped to the business, and a missing patient is not logged as exported', async () => {
    const { svc, prisma, audit } = setup();
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(svc.patientExport('biz-1', 'nope', { id: 'u', name: 'x' })).rejects.toThrow(NotFoundException);
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({ where: { id: 'nope', businessId: 'biz-1' } });
    expect(audit.createEntry).not.toHaveBeenCalled();
  });
});
