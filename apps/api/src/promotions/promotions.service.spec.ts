import { PromotionsService } from './promotions.service';

function makePromotion(overrides: Record<string, any> = {}) {
  const now = new Date();
  const future = new Date(now.getTime() + 7 * 86400000);
  return {
    id: 'promo-1', businessId: 'biz-1', name: '10% Off', discountType: 'PERCENTAGE', discountValue: 10,
    isActive: true, startDate: new Date(now.getTime() - 86400000), endDate: future,
    minPurchaseCents: null, maxDiscountCents: null, applicableItems: '[]', ...overrides,
  };
}

function makePrisma() {
  return {
    promotion: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const svc = new PromotionsService(prisma);
  return { svc, prisma };
}

describe('PromotionsService', () => {
  describe('createPromotion', () => {
    it('creates a promotion with stringified applicableItems', async () => {
      const promo = makePromotion();
      const { svc, prisma } = makeService();
      prisma.promotion.create.mockResolvedValue(promo);
      await svc.createPromotion({ businessId: 'biz-1', name: '10% Off', type: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 10, startDate: new Date(), endDate: new Date(), applicableItems: ['item-1'] });
      const data = prisma.promotion.create.mock.calls[0][0].data;
      expect(data.applicableItems).toBe('["item-1"]');
    });
  });

  describe('getPromotions', () => {
    it('returns promotions for businessId', async () => {
      const { svc, prisma } = makeService();
      prisma.promotion.findMany.mockResolvedValue([makePromotion()]);
      const result = await svc.getPromotions('biz-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getActivePromotions', () => {
    it('returns active non-expired promotions', async () => {
      const { svc, prisma } = makeService();
      prisma.promotion.findMany.mockResolvedValue([makePromotion()]);
      const result = await svc.getActivePromotions('biz-1');
      expect(result).toHaveLength(1);
      const where = prisma.promotion.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
    });
  });

  describe('applyPromotion', () => {
    it('calculates PERCENTAGE discount correctly', async () => {
      const promo = makePromotion({ discountType: 'PERCENTAGE', discountValue: 20 });
      const { svc, prisma } = makeService();
      prisma.promotion.findUnique.mockResolvedValue(promo);
      const discount = await svc.applyPromotion('promo-1', 100000, []);
      expect(discount).toBe(20000); // 20% of 100000
    });

    it('calculates FIXED discount correctly', async () => {
      const promo = makePromotion({ discountType: 'FIXED', discountValue: 5000 });
      const { svc, prisma } = makeService();
      prisma.promotion.findUnique.mockResolvedValue(promo);
      const discount = await svc.applyPromotion('promo-1', 100000, []);
      expect(discount).toBe(5000);
    });

    it('returns 0 if promotion is inactive', async () => {
      const promo = makePromotion({ isActive: false });
      const { svc, prisma } = makeService();
      prisma.promotion.findUnique.mockResolvedValue(promo);
      const discount = await svc.applyPromotion('promo-1', 100000, []);
      expect(discount).toBe(0);
    });

    it('returns 0 if subtotal below minPurchaseCents', async () => {
      const promo = makePromotion({ minPurchaseCents: 200000 });
      const { svc, prisma } = makeService();
      prisma.promotion.findUnique.mockResolvedValue(promo);
      const discount = await svc.applyPromotion('promo-1', 100000, []);
      expect(discount).toBe(0);
    });

    it('caps discount at maxDiscountCents', async () => {
      const promo = makePromotion({ discountType: 'PERCENTAGE', discountValue: 50, maxDiscountCents: 10000 });
      const { svc, prisma } = makeService();
      prisma.promotion.findUnique.mockResolvedValue(promo);
      const discount = await svc.applyPromotion('promo-1', 100000, []);
      expect(discount).toBe(10000);
    });

    it('returns 0 if no applicable items match', async () => {
      const promo = makePromotion({ applicableItems: '["item-x"]' });
      const { svc, prisma } = makeService();
      prisma.promotion.findUnique.mockResolvedValue(promo);
      const discount = await svc.applyPromotion('promo-1', 100000, ['item-1']);
      expect(discount).toBe(0);
    });
  });

  describe('updatePromotion', () => {
    it('calls prisma.update with correct id', async () => {
      const { svc, prisma } = makeService();
      prisma.promotion.update.mockResolvedValue(makePromotion());
      await svc.updatePromotion('promo-1', { name: 'New Name' });
      expect(prisma.promotion.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'promo-1' } }));
    });
  });
});
