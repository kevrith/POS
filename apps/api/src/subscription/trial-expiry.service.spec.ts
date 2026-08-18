import { TrialExpiryService } from './trial-expiry.service';

function makeService(due: any[] = []) {
  const prisma: any = {
    business: {
      findMany: jest.fn().mockResolvedValue(due),
      updateMany: jest.fn().mockResolvedValue({ count: due.length }),
    },
  };
  return { svc: new TrialExpiryService(prisma), prisma };
}

describe('TrialExpiryService', () => {
  it('expires trials whose date has passed', async () => {
    const { svc, prisma } = makeService([
      { id: 'b1', name: 'Jumbo agrovet', trialEndsAt: new Date('2026-07-16') },
      { id: 'b2', name: 'Biz mtaani', trialEndsAt: new Date('2026-05-30') },
    ]);

    const res = await svc.expireFinishedTrials();

    expect(res.expired).toBe(2);
    expect(prisma.business.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1', 'b2'] } },
      data: { subscriptionStatus: 'EXPIRED' },
    });
  });

  it('only looks at unpaid, uncomped trials with a date in the past', async () => {
    const { svc, prisma } = makeService();
    await svc.expireFinishedTrials();

    const where = prisma.business.findMany.mock.calls[0][0].where;
    expect(where.subscriptionStatus).toBe('TRIAL');
    expect(where.isComped).toBe(false);
    // A gift has no trial to end, and a null date means no trial was ever set.
    expect(where.trialEndsAt.not).toBeNull();
    expect(where.trialEndsAt.lt).toBeInstanceOf(Date);
  });

  it('leaves the tier alone — it records what they were trialling', async () => {
    const { svc, prisma } = makeService([{ id: 'b1', name: 'X', trialEndsAt: new Date() }]);
    await svc.expireFinishedTrials();

    const data = prisma.business.updateMany.mock.calls[0][0].data;
    expect(data).toEqual({ subscriptionStatus: 'EXPIRED' });
    expect(data).not.toHaveProperty('subscriptionTier');
  });

  it('writes nothing when there is nothing due', async () => {
    const { svc, prisma } = makeService([]);
    const res = await svc.expireFinishedTrials();
    expect(res.expired).toBe(0);
    expect(prisma.business.updateMany).not.toHaveBeenCalled();
  });
});
