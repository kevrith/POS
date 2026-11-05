import { LedgerService } from './ledger.service';

const clash = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
const LINES = [{ accountCode: '1000', accountName: 'Cash', debitCents: 1, creditCents: 0 }, { accountCode: '4000', accountName: 'Rev', debitCents: 0, creditCents: 1 }];

function setup(last: string | null = null) {
  const prisma: any = {
    journalEntry: {
      findFirst: jest.fn().mockResolvedValue(last ? { entryNumber: last } : null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'e', ...data })),
    },
  };
  return { prisma, svc: new LedgerService(prisma) };
}
const post = (svc: LedgerService, businessId = 'biz-1') => svc.autoPost({ businessId, description: 'd', reference: 'r', sourceType: 'T', lines: LINES });

describe('journal entry numbers', () => {
  it('carry the business, so two businesses never share JE-000001', async () => {
    const a = setup(); const b = setup();
    await post(a.svc, 'biz-aaa'); await post(b.svc, 'biz-bbb');
    const x = a.prisma.journalEntry.create.mock.calls[0][0].data.entryNumber;
    const y = b.prisma.journalEntry.create.mock.calls[0][0].data.entryNumber;
    expect(x).toMatch(/^JE-[0-9A-F]{5}-000001$/);
    expect(y).toMatch(/^JE-[0-9A-F]{5}-000001$/);
    expect(x).not.toBe(y);
  });

  it('continue from the highest number the business used, not from a count', async () => {
    const { svc, prisma } = setup();
    await post(svc);
    const prefix = prisma.journalEntry.create.mock.calls[0][0].data.entryNumber.slice(0, -6);
    const next = setup(`${prefix}000041`);
    await post(next.svc);
    expect(next.prisma.journalEntry.create.mock.calls[0][0].data.entryNumber).toBe(`${prefix}000042`);
    expect(next.prisma.journalEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { entryNumber: 'desc' } }));
  });

  it('two entries at the same moment: the second takes the next number instead of being lost', async () => {
    const { svc, prisma } = setup();
    prisma.journalEntry.create.mockRejectedValueOnce(clash()).mockImplementation(async ({ data }: any) => ({ id: 'e', ...data }));
    await post(svc);
    expect(prisma.journalEntry.create).toHaveBeenCalledTimes(2);
  });

  it('gives up (quietly, as a background posting must) after repeated clashes, and does not mask other errors', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = setup(); a.prisma.journalEntry.create.mockRejectedValue(clash());
    await expect(post(a.svc)).resolves.toBeUndefined();
    expect(a.prisma.journalEntry.create).toHaveBeenCalledTimes(8);
    const b = setup(); b.prisma.journalEntry.create.mockRejectedValue(new Error('db down'));
    await post(b.svc);
    expect(b.prisma.journalEntry.create).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
