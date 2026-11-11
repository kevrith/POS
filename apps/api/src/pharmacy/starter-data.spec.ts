import { PharmacyService } from './pharmacy.service';
import { STARTER_DRUGS, STARTER_INTERACTIONS } from './starter-data';
import { evaluateSafety } from '../prescriptions/clinical-safety';

function setup(existing: { interactions?: any[]; drugs?: any[] } = {}) {
  const prisma: any = {
    drugInteraction: { findMany: jest.fn().mockResolvedValue(existing.interactions ?? []), createMany: jest.fn().mockResolvedValue({}) },
    formularyEntry: { findMany: jest.fn().mockResolvedValue(existing.drugs ?? []), createMany: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, svc: new PharmacyService(prisma, {} as any) };
}

describe('starter data', () => {
  it('has no repeated pair or drug, and every dose limit has a unit', () => {
    const pairs = STARTER_INTERACTIONS.map((i) => [i.drug1Name, i.drug2Name].sort().join('|'));
    expect(new Set(pairs).size).toBe(pairs.length);
    const drugs = STARTER_DRUGS.map((d) => d.genericName.toLowerCase());
    expect(new Set(drugs).size).toBe(drugs.length);
    for (const d of STARTER_DRUGS) if (d.maxDailyDose) expect(d.unit).toBeTruthy();
  });

  it('actually trips the safety check for its own pairs and limits', () => {
    const w = evaluateSafety({ patient: null, lines: [{ name: 'Warfarin 5mg' }, { name: 'Aspirin 75mg' }], interactions: STARTER_INTERACTIONS, formulary: [] });
    expect(w.some((x) => x.kind === 'INTERACTION' && x.severity === 'BLOCK')).toBe(true);
    const sild = evaluateSafety({ patient: null, lines: [{ name: 'Sildenafil 50mg' }, { name: 'Isosorbide dinitrate' }], interactions: STARTER_INTERACTIONS, formulary: [] });
    expect(sild.some((x) => x.severity === 'BLOCK')).toBe(true);
    const over = evaluateSafety({ patient: null, lines: [{ name: 'Paracetamol 500mg', dose: 3, doseUnit: 'tablet', frequency: 'QDS' }], interactions: [], formulary: STARTER_DRUGS as any });
    expect(over.some((x) => x.kind === 'MAX_DOSE')).toBe(true);
    const fine = evaluateSafety({ patient: null, lines: [{ name: 'Paracetamol 500mg', dose: 2, doseUnit: 'tablet', frequency: 'QDS' }], interactions: [], formulary: STARTER_DRUGS as any });
    expect(fine.some((x) => x.kind === 'MAX_DOSE')).toBe(false);
  });

  it('adds everything to an empty pharmacy, for this business only', async () => {
    const { svc, prisma } = setup();
    const res = await svc.loadStarterData('biz-1');
    expect(res).toEqual({ interactionsAdded: STARTER_INTERACTIONS.length, drugsAdded: STARTER_DRUGS.length });
    expect(prisma.drugInteraction.createMany.mock.calls[0][0].data.every((d: any) => d.businessId === 'biz-1')).toBe(true);
    expect(prisma.formularyEntry.createMany.mock.calls[0][0].data.every((d: any) => d.businessId === 'biz-1' && d.scheduleClass === 'OTC')).toBe(true);
  });

  it('adds nothing the second time, and leaves a pharmacist\'s own entries alone', async () => {
    const own = { genericName: 'paracetamol', brandName: null, strength: '1g' };
    const { svc, prisma } = setup({
      interactions: [{ drug1Name: 'ASPIRIN', drug2Name: 'Warfarin tablets' }],
      drugs: [own, ...STARTER_DRUGS.slice(1).map((d) => ({ genericName: d.genericName, brandName: d.brandName ?? null, strength: d.strength }))],
    });
    const res = await svc.loadStarterData('biz-1');
    expect(res.drugsAdded).toBe(0);
    expect(res.interactionsAdded).toBe(STARTER_INTERACTIONS.length - 1);
    expect(prisma.formularyEntry.createMany).not.toHaveBeenCalled();
  });
});
