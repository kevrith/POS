import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { buildClaimJournalLines } from '../sales/sale-ledger';

function setup(claim: Record<string, any> | null = { id: 'c1', businessId: 'biz-1', status: 'APPROVED', billedCents: 33_600, approvedCents: 33_600, saleId: 'sale-1', claimNumber: 'CL-1' }) {
  const prisma: any = {
    insuranceClaim: {
      findFirst: jest.fn().mockResolvedValue(claim),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const ledger: any = { autoPost: jest.fn().mockResolvedValue(undefined) };
  return { prisma, ledger, svc: new PharmacyService(prisma, ledger) };
}

describe('claim journal', () => {
  it('paid in full clears the receivable into the bank', () => {
    expect(buildClaimJournalLines('PAID', 33_600, 33_600).map((l) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1030', 33_600, 0], ['1200', 0, 33_600]]);
  });
  it('paid short writes the shortfall off', () => {
    expect(buildClaimJournalLines('PAID', 33_600, 30_000).map((l) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1030', 30_000, 0], ['6900', 3_600, 0], ['1200', 0, 33_600]]);
  });
  it('paid more than billed keeps the extra as income, so the money that arrived is all booked', () => {
    const lines = buildClaimJournalLines('PAID', 33_600, 35_000);
    expect(lines.map((l) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1030', 35_000, 0], ['1200', 0, 33_600], ['4400', 0, 1_400]]);
  });
  it('rejected writes the whole claim off, and the entry always balances', () => {
    const lines = buildClaimJournalLines('REJECTED', 33_600, 99);
    expect(lines.map((l) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['6900', 33_600, 0], ['1200', 0, 33_600]]);
    for (const args of [['PAID', 100, 500], ['PAID', 100, 0], ['REJECTED', 0, 0]] as const) {
      const l = buildClaimJournalLines(args[0], args[1], args[2]);
      expect(l.reduce((s, x) => s + x.debitCents, 0)).toBe(l.reduce((s, x) => s + x.creditCents, 0));
    }
  });
});

describe('PharmacyService.updateClaim', () => {
  it('paying a claim raised from a fill posts the receivable clearing, once', async () => {
    const { svc, prisma, ledger } = setup();
    await svc.updateClaim('c1', 'biz-1', { status: 'PAID', paidCents: 33_600 });
    expect(prisma.insuranceClaim.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1', businessId: 'biz-1', status: { notIn: ['PAID', 'REJECTED', 'VOIDED'] } } }));
    await Promise.resolve();
    expect(ledger.autoPost).toHaveBeenCalledWith(expect.objectContaining({ reference: 'CLAIM-c1', sourceType: 'INSURANCE_CLAIM', businessId: 'biz-1' }));
  });

  it('a hand-raised claim that never reached receivables: what the insurer pays is income', async () => {
    const { svc, ledger } = setup({ id: 'c2', status: 'APPROVED', billedCents: 1000, approvedCents: 1000, saleId: null, receivableBooked: false });
    await svc.updateClaim('c2', 'biz-1', { status: 'PAID', paidCents: 900 });
    await Promise.resolve();
    expect(ledger.autoPost.mock.calls[0][0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1030', 900, 0], ['4450', 0, 900]]);
  });

  it('...and rejecting it posts nothing', async () => {
    const { svc, ledger } = setup({ id: 'c2', status: 'SUBMITTED', billedCents: 1000, saleId: null, receivableBooked: false });
    await svc.updateClaim('c2', 'biz-1', { status: 'REJECTED' });
    expect(ledger.autoPost).not.toHaveBeenCalled();
  });

  it('a hand-raised claim an opening balance brought into receivables clears them when paid', async () => {
    const { svc, ledger } = setup({ id: 'c3', status: 'APPROVED', billedCents: 1000, approvedCents: 1000, saleId: null, receivableBooked: true });
    await svc.updateClaim('c3', 'biz-1', { status: 'PAID', paidCents: 1000 });
    await Promise.resolve();
    expect(ledger.autoPost.mock.calls[0][0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1030', 1000, 0], ['1200', 0, 1000]]);
  });

  it('a voided claim does not move again either', async () => {
    const { svc } = setup({ id: 'c1', status: 'VOIDED', billedCents: 1, saleId: 's' });
    await expect(svc.updateClaim('c1', 'biz-1', { status: 'PAID', paidCents: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a settled claim does not move again, and a lost race does not post', async () => {
    const closed = setup({ id: 'c1', status: 'PAID', billedCents: 1, saleId: 's' });
    await expect(closed.svc.updateClaim('c1', 'biz-1', { status: 'PAID', paidCents: 1 })).rejects.toBeInstanceOf(BadRequestException);
    const race = setup();
    race.prisma.insuranceClaim.updateMany.mockResolvedValue({ count: 0 });
    await expect(race.svc.updateClaim('c1', 'biz-1', { status: 'PAID', paidCents: 1 })).rejects.toThrow(/just changed/);
    expect(race.ledger.autoPost).not.toHaveBeenCalled();
  });

  it('treats another business\'s claim as missing, and only moves the fields it should', async () => {
    const none = setup(null);
    await expect(none.svc.updateClaim('c1', 'biz-2', { status: 'PAID' })).rejects.toBeInstanceOf(NotFoundException);
    const { svc, prisma } = setup();
    await svc.updateClaim('c1', 'biz-1', { status: 'APPROVED', approvedCents: 30_000, billedCents: 1, saleId: 'x', businessId: 'biz-9' } as any);
    expect(prisma.insuranceClaim.updateMany.mock.calls[0][0].data).toEqual({ status: 'APPROVED', approvedCents: 30_000 });
  });

  it('a hand-raised claim cannot name a sale', async () => {
    const { svc, prisma } = setup();
    await svc.createClaim({ businessId: 'biz-1', prescriptionId: 'rx', providerId: 'p', billedCents: 5, saleId: 'sneaky' } as any);
    expect(prisma.insuranceClaim.create.mock.calls[0][0].data).not.toHaveProperty('saleId');
  });
});
