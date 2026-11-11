import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { ageYears, cleanAllergies, parseBirthDate, patientData } from './patient-data';

function setup() {
  const p: any = {
    patient: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'pt-1', allergies: '[]', conditions: '[]', dateOfBirth: null, ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'pt-1', businessId: 'biz-1', allergies: '[]', conditions: '[]', dateOfBirth: null, ...data })),
    },
    prescription: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    insuranceProvider: { findFirst: jest.fn().mockResolvedValue({ id: 'ins-1' }) },
  };
  return { prisma: p, svc: new PatientsService(p) };
}
const existing = (o: Record<string, unknown> = {}) => ({ id: 'pt-1', businessId: 'biz-1', name: 'Jane Doe', phone: '0711', idNumber: '123', allergies: '[]', conditions: '[]', dateOfBirth: null, isActive: true, ...o });

describe('birth dates and age', () => {
  it('accepts a real date and refuses nonsense', () => {
    expect(parseBirthDate('1990-04-23').toISOString()).toBe('1990-04-23T00:00:00.000Z');
    expect(() => parseBirthDate('23/04/1990')).toThrow(/look like/);
    expect(() => parseBirthDate('1990-02-31')).toThrow(/real date/);
    expect(() => parseBirthDate('2999-01-01')).toThrow(/future/);
    expect(() => parseBirthDate('1800-01-01')).toThrow(/130 years/);
  });

  it('works out whole years', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    expect(ageYears(new Date('1990-11-12T00:00:00Z'), now)).toBe(36);
    expect(ageYears(new Date('1990-11-13T00:00:00Z'), now)).toBe(35);
    expect(ageYears(null, now)).toBeNull();
  });
});

describe('what is saved', () => {
  it('cleans allergies: trims, drops duplicates, checks severity', () => {
    expect(cleanAllergies([' Penicillin ', { substance: 'penicillin' }, { substance: 'Sulfa', reaction: 'rash', severity: 'severe' }])).toEqual([{ substance: 'Penicillin' }, { substance: 'Sulfa', reaction: 'rash', severity: 'SEVERE' }]);
    expect(() => cleanAllergies([{ substance: 'X', severity: 'awful' }])).toThrow(/severity/);
    expect(() => cleanAllergies('penicillin' as any)).toThrow(/list/);
    expect(() => cleanAllergies([{ substance: '' }])).toThrow();
  });

  it('only touches what was sent, and blank clears an optional field', () => {
    expect(patientData({ phone: '' , weightKg: 62 }, false)).toEqual({ phone: null, weightKg: 62 });
    expect(() => patientData({}, true)).toThrow(/Patient name/);
    expect(() => patientData({ name: 'A', sex: 'x' }, true)).toThrow(/Sex/);
    expect(() => patientData({ name: 'A', weightKg: 900 }, true)).toThrow(/Weight/);
    expect(() => patientData({ name: 'A', sex: 'M', pregnant: true }, true)).toThrow(/male/);
  });
});

describe('PatientsService', () => {
  it('numbers patients per business from the highest issued', async () => {
    const { svc, prisma } = setup();
    prisma.patient.findFirst.mockImplementation(async ({ where }: any) => (where.patientNumber ? { patientNumber: 'PT-0041' } : null));
    const made: any = await svc.create('biz-1', { name: 'Jane' });
    expect(made.patientNumber).toBe('PT-0042');
    expect(prisma.patient.create.mock.calls[0][0].data.businessId).toBe('biz-1');
  });

  it('retries the number when two are registered at once', async () => {
    const { svc, prisma } = setup();
    prisma.patient.create.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'P2002' }));
    await svc.create('biz-1', { name: 'Jane' });
    expect(prisma.patient.create).toHaveBeenCalledTimes(2);
  });

  it('refuses a second live patient with the same ID, naming the first', async () => {
    const { svc, prisma } = setup();
    prisma.patient.findFirst.mockImplementation(async ({ where }: any) => (where.idNumber ? { patientNumber: 'PT-0003', name: 'Jane Doe' } : null));
    await expect(svc.create('biz-1', { name: 'Jane Again', idNumber: '123' })).rejects.toThrow(ConflictException);
    await expect(svc.create('biz-1', { name: 'Jane Again', idNumber: '123' })).rejects.toThrow(/Jane Doe \(PT-0003\)/);
    expect(prisma.patient.create).not.toHaveBeenCalled();
  });

  it('refuses an insurer that is not this business\'s', async () => {
    const { svc, prisma } = setup();
    prisma.insuranceProvider.findFirst.mockResolvedValue(null);
    await expect(svc.create('biz-1', { name: 'J', insuranceProviderId: 'ins-x' })).rejects.toThrow(BadRequestException);
  });

  it('updates only a patient of this business, and an ID can stay on its own record', async () => {
    const { svc, prisma } = setup();
    await expect(svc.update('pt-x', 'biz-1', { name: 'J' })).rejects.toThrow(NotFoundException);
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({ where: { id: 'pt-x', businessId: 'biz-1' } });

    prisma.patient.findFirst.mockImplementation(async ({ where }: any) => (where.id === 'pt-1' ? existing() : null));
    await svc.update('pt-1', 'biz-1', { idNumber: '123', allergies: ['Penicillin'] });
    expect(prisma.patient.update).toHaveBeenCalledWith({ where: { id: 'pt-1' }, data: { idNumber: '123', allergies: '[{"substance":"Penicillin"}]' } });
    await expect(svc.update('pt-1', 'biz-1', {})).rejects.toThrow(/Nothing to change/);
  });

  it('switching a patient back on checks their ID is still free', async () => {
    const { svc, prisma } = setup();
    prisma.patient.findFirst.mockImplementation(async ({ where }: any) => (where.id === 'pt-1' ? existing({ isActive: false }) : { patientNumber: 'PT-0009', name: 'Someone' }));
    await expect(svc.setActive('pt-1', 'biz-1', true)).rejects.toThrow(ConflictException);
  });

  it('possibleMatches needs something to go on', async () => {
    const { svc, prisma } = setup();
    expect(await svc.possibleMatches('biz-1', { name: 'ab' })).toEqual([]);
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
    await svc.possibleMatches('biz-1', { name: 'Jane', phone: '0711' });
    expect(prisma.patient.findMany.mock.calls[0][0].where).toMatchObject({ businessId: 'biz-1', isActive: true });
  });

  it('adopts only unlinked prescriptions of this business', async () => {
    const { svc, prisma } = setup();
    prisma.patient.findFirst.mockResolvedValue(existing());
    expect(await svc.adoptPrescriptions('pt-1', 'biz-1', ['a', 'b'])).toEqual({ linked: 2 });
    expect(prisma.prescription.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] }, businessId: 'biz-1', patientId: null }, data: { patientId: 'pt-1' } });
    await expect(svc.adoptPrescriptions('pt-1', 'biz-1', [])).rejects.toThrow(/1 and 200/);
  });

  it('safetyFacts is null for no patient or another business\'s', async () => {
    const { svc, prisma } = setup();
    expect(await svc.safetyFacts('biz-1', null)).toBeNull();
    expect(await svc.safetyFacts('biz-1', 'pt-x')).toBeNull();
    prisma.patient.findFirst.mockResolvedValue(existing({ allergies: '[{"substance":"Sulfa"}]', pregnant: true }));
    expect(await svc.safetyFacts('biz-1', 'pt-1')).toMatchObject({ allergies: [{ substance: 'Sulfa' }], pregnant: true });
  });
});
