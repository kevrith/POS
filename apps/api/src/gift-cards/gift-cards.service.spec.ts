import { GiftCardsService } from './gift-cards.service';

function makeGiftCard(overrides: Record<string, any> = {}) {
  return { id: 'gc-1', businessId: 'biz-1', code: 'GCABC123', initialBalanceCents: 50000, balanceCents: 50000, status: 'ACTIVE', expiresAt: null, ...overrides };
}

function makePrisma() {
  return {
    giftCard: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    giftCardTransaction: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const svc = new GiftCardsService(prisma);
  return { svc, prisma };
}

describe('GiftCardsService', () => {
  describe('createGiftCard', () => {
    it('creates a gift card with balanceCents = initialBalanceCents', async () => {
      const gc = makeGiftCard();
      const { svc, prisma } = makeService();
      prisma.giftCard.create.mockResolvedValue(gc);
      await svc.createGiftCard({ businessId: 'biz-1', initialValueCents: 50000 });
      const data = prisma.giftCard.create.mock.calls[0][0].data;
      expect(data.balanceCents).toBe(50000);
      expect(data.initialValueCents).toBe(50000);
    });

    it('assigns a generated code', async () => {
      const gc = makeGiftCard();
      const { svc, prisma } = makeService();
      prisma.giftCard.create.mockResolvedValue(gc);
      await svc.createGiftCard({ businessId: 'biz-1', initialValueCents: 10000 });
      const data = prisma.giftCard.create.mock.calls[0][0].data;
      expect(typeof data.code).toBe('string');
      expect(data.code.length).toBeGreaterThan(0);
    });
  });

  describe('getGiftCard', () => {
    it('returns the gift card for a code', async () => {
      const gc = makeGiftCard();
      const { svc, prisma } = makeService();
      prisma.giftCard.findUnique.mockResolvedValue(gc);
      const result = await svc.getGiftCard('GCABC123');
      expect(result?.code).toBe('GCABC123');
    });

    it('throws NotFound for an unknown code instead of returning an empty body', async () => {
      const { svc, prisma } = makeService();
      prisma.giftCard.findUnique.mockResolvedValue(null);
      await expect(svc.getGiftCard('NOPE')).rejects.toThrow('Gift card not found');
    });
  });

  describe('redeemGiftCard', () => {
    it('deducts balance and creates a transaction', async () => {
      const gc = makeGiftCard({ balanceCents: 50000 });
      const { svc, prisma } = makeService();
      prisma.giftCard.findUnique.mockResolvedValue(gc);
      prisma.giftCard.update.mockResolvedValue({ ...gc, balanceCents: 30000 });
      const result = await svc.redeemGiftCard('GCABC123', 20000, 'sale-1');
      expect(result.balanceCents).toBe(30000);
      expect(prisma.giftCard.update).toHaveBeenCalledTimes(1);
      expect(prisma.giftCardTransaction.create).toHaveBeenCalledTimes(1);
    });

    it('throws if balance is insufficient', async () => {
      const gc = makeGiftCard({ balanceCents: 5000 });
      const { svc, prisma } = makeService();
      prisma.giftCard.findUnique.mockResolvedValue(gc);
      await expect(svc.redeemGiftCard('GCABC123', 20000, 'sale-1')).rejects.toThrow('Insufficient');
    });

    it('throws if gift card is not ACTIVE', async () => {
      const gc = makeGiftCard({ status: 'EXPIRED' });
      const { svc, prisma } = makeService();
      prisma.giftCard.findUnique.mockResolvedValue(gc);
      await expect(svc.redeemGiftCard('GCABC123', 1000, 'sale-1')).rejects.toThrow('not active');
    });
  });

  describe('topUpGiftCard', () => {
    it('adds balance and creates a TOPUP transaction', async () => {
      const gc = makeGiftCard({ balanceCents: 10000 });
      const { svc, prisma } = makeService();
      prisma.giftCard.findUnique.mockResolvedValue(gc);
      prisma.giftCard.update.mockResolvedValue({ ...gc, balanceCents: 30000 });
      const result = await svc.topUpGiftCard('GCABC123', 20000);
      expect(result.balanceCents).toBe(30000);
      const txData = prisma.giftCardTransaction.create.mock.calls[0][0].data;
      expect(txData.type).toBe('TOP_UP');
    });
  });

  describe('getGiftCards', () => {
    it('returns gift cards for businessId', async () => {
      const { svc, prisma } = makeService();
      prisma.giftCard.findMany.mockResolvedValue([makeGiftCard()]);
      const result = await svc.getGiftCards('biz-1');
      expect(result).toHaveLength(1);
    });

    it('filters by status when provided', async () => {
      const { svc, prisma } = makeService();
      prisma.giftCard.findMany.mockResolvedValue([]);
      await svc.getGiftCards('biz-1', 'EXPIRED');
      const where = prisma.giftCard.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('EXPIRED');
    });
  });
});
