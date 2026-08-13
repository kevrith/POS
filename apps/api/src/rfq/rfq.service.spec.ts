import { RFQService } from './rfq.service';

function makePrisma() {
  return {
    rFQ: { count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    rFQItem: { findMany: jest.fn() },
    rFQResponse: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    supplier: { findMany: jest.fn(), findFirst: jest.fn() },
    item: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
    store: { findFirst: jest.fn() },
    business: { findUnique: jest.fn().mockResolvedValue({ name: 'Wazi Biz' }) },
    $transaction: jest.fn(),
  };
}

function makeEmail() {
  return { send: jest.fn().mockResolvedValue(true) };
}

function makeService(overrides: Record<string, any> = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const email = makeEmail();
  return { svc: new RFQService(prisma, email as any), prisma, email };
}

describe('RFQService', () => {
  describe('normalisePhone', () => {
    it.each([
      ['0712345678', '254712345678'],
      ['+254712345678', '254712345678'],
      ['254 712 345 678', '254712345678'],
      ['712345678', '254712345678'],
    ])('turns %s into %s', (raw, expected) => {
      expect(RFQService.normalisePhone(raw)).toBe(expected);
    });

    it('returns null when there is nothing dialable', () => {
      expect(RFQService.normalisePhone('sales@acme.co.ke')).toBeNull();
      expect(RFQService.normalisePhone('')).toBeNull();
      expect(RFQService.normalisePhone(null)).toBeNull();
    });
  });

  describe('invite', () => {
    it('creates one tokenised invitation per new supplier', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({ id: 'rfq-1', businessId: 'biz-1' });
      prisma.supplier.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      prisma.rFQResponse.findMany.mockResolvedValue([]);
      prisma.rFQ.findFirst.mockResolvedValue({
        id: 'rfq-1',
        businessId: 'biz-1',
        rfqNumber: 'RFQ-00001',
        deadline: null,
        notes: null,
        items: [],
        responses: [],
      });

      await svc.invite('rfq-1', 'biz-1', ['s-1', 's-2']);

      const rows = prisma.rFQResponse.createMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(2);
      expect(rows.every((r: any) => r.status === 'INVITED' && r.quotedPriceCents === 0)).toBe(true);
      expect(new Set(rows.map((r: any) => r.token)).size).toBe(2);
      expect(rows[0].token).toMatch(/^[0-9a-f]{48}$/);
    });

    it('does not re-invite a supplier already on the RFQ', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({
        id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-00001',
        deadline: null, notes: null, items: [], responses: [],
      });
      prisma.supplier.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.rFQResponse.findMany.mockResolvedValue([{ supplierId: 's-1' }]);

      await svc.invite('rfq-1', 'biz-1', ['s-1']);

      expect(prisma.rFQResponse.createMany).not.toHaveBeenCalled();
    });

    it('rejects a supplier from another business', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({ id: 'rfq-1', businessId: 'biz-1' });
      prisma.supplier.findMany.mockResolvedValue([]);

      await expect(svc.invite('rfq-1', 'biz-1', ['s-x'])).rejects.toThrow('do not belong');
    });
  });

  describe('getRecipients', () => {
    it('builds a wa.me link and quote url per supplier', async () => {
      process.env.FRONTEND_URL = 'https://pos.example.com';
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({
        id: 'rfq-1',
        businessId: 'biz-1',
        rfqNumber: 'RFQ-00007',
        deadline: new Date('2026-08-20T00:00:00Z'),
        notes: 'Urgent',
        items: [{ itemId: 'i-1', quantityNeeded: 12 }],
        responses: [
          {
            id: 'r-1', supplierId: 's-1', status: 'INVITED', token: 'tok123',
            invitedAt: null, respondedAt: null,
            supplier: { name: 'Acme Ltd', phone: '0712345678', email: 'sales@acme.co.ke', contact: null },
          },
        ],
      });
      prisma.item.findMany.mockResolvedValue([{ id: 'i-1', name: 'Sugar 2kg' }]);

      const [r] = await svc.getRecipients('rfq-1', 'biz-1');

      expect(r.quoteUrl).toBe('https://pos.example.com/quote/tok123');
      expect(r.whatsappUrl).toContain('https://wa.me/254712345678?text=');
      expect(decodeURIComponent(r.whatsappUrl!)).toContain('Sugar 2kg x 12');
      expect(r.message).toContain('RFQ-00007');
      expect(r.message).toContain('https://pos.example.com/quote/tok123');
    });

    it('falls back to the legacy contact field for the phone', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({
        id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-1', deadline: null, notes: null,
        items: [],
        responses: [{
          id: 'r-1', supplierId: 's-1', status: 'INVITED', token: 't', invitedAt: null, respondedAt: null,
          supplier: { name: 'Old Supplier', phone: null, email: null, contact: '0722000111' },
        }],
      });

      const [r] = await svc.getRecipients('rfq-1', 'biz-1');
      expect(r.phone).toBe('254722000111');
    });

    it('gives no WhatsApp link when there is no usable number', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({
        id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-1', deadline: null, notes: null,
        items: [],
        responses: [{
          id: 'r-1', supplierId: 's-1', status: 'INVITED', token: 't', invitedAt: null, respondedAt: null,
          supplier: { name: 'No Phone Ltd', phone: null, email: 'x@y.com', contact: null },
        }],
      });

      const [r] = await svc.getRecipients('rfq-1', 'biz-1');
      expect(r.whatsappUrl).toBeNull();
      expect(r.phone).toBeNull();
    });
  });

  describe('send', () => {
    it('emails invited suppliers who have an email and reports who got one', async () => {
      const { svc, prisma, email } = makeService();
      prisma.rFQ.findFirst
        .mockResolvedValueOnce({ id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-1', status: 'DRAFT' })
        .mockResolvedValue({
          id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-1', deadline: null, notes: null,
          items: [],
          responses: [
            { id: 'r-1', supplierId: 's-1', status: 'INVITED', token: 't1', invitedAt: null, respondedAt: null,
              supplier: { name: 'Has Email', phone: null, email: 'a@b.com', contact: null } },
            { id: 'r-2', supplierId: 's-2', status: 'INVITED', token: 't2', invitedAt: null, respondedAt: null,
              supplier: { name: 'No Email', phone: '0712345678', email: null, contact: null } },
          ],
        });
      prisma.rFQ.update.mockResolvedValue({ id: 'rfq-1', status: 'SENT' });

      const res = await svc.send('rfq-1', 'biz-1');

      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].to).toBe('a@b.com');
      expect(res.emailed).toEqual(['Has Email']);
      expect(res.recipients).toHaveLength(2);
    });

    it('does not let one bad mailbox abort the send', async () => {
      const { svc, prisma, email } = makeService();
      email.send.mockRejectedValueOnce(new Error('mailbox full'));
      prisma.rFQ.findFirst
        .mockResolvedValueOnce({ id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-1', status: 'DRAFT' })
        .mockResolvedValue({
          id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-1', deadline: null, notes: null,
          items: [],
          responses: [{
            id: 'r-1', supplierId: 's-1', status: 'INVITED', token: 't1', invitedAt: null, respondedAt: null,
            supplier: { name: 'Bounces', phone: null, email: 'bad@x.com', contact: null },
          }],
        });
      prisma.rFQ.update.mockResolvedValue({ id: 'rfq-1', status: 'SENT' });

      const res = await svc.send('rfq-1', 'biz-1');
      expect(res.emailed).toEqual([]);
    });

    it('refuses to send an awarded RFQ', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({ id: 'rfq-1', businessId: 'biz-1', status: 'AWARDED' });
      await expect(svc.send('rfq-1', 'biz-1')).rejects.toThrow('already been awarded');
    });
  });

  describe('submitPublicQuote', () => {
    function invitedResponse(overrides: Record<string, any> = {}) {
      return {
        id: 'r-1',
        rfqId: 'rfq-1',
        status: 'INVITED',
        supplier: { name: 'Acme' },
        rfq: { id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-1', status: 'SENT', items: [] },
        ...overrides,
      };
    }

    it('records the supplier price and moves the RFQ to RECEIVED', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQResponse.findUnique.mockResolvedValue(invitedResponse());

      await svc.submitPublicQuote('tok', { quotedPriceCents: 450000, deliveryDays: 3 });

      expect(prisma.rFQResponse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r-1' },
          data: expect.objectContaining({
            quotedPriceCents: 450000,
            deliveryDays: 3,
            status: 'PENDING',
          }),
        }),
      );
      expect(prisma.rFQ.update).toHaveBeenCalledWith({
        where: { id: 'rfq-1' },
        data: { status: 'RECEIVED' },
      });
    });

    it('rejects an unknown token', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQResponse.findUnique.mockResolvedValue(null);
      await expect(svc.submitPublicQuote('nope', { quotedPriceCents: 1 })).rejects.toThrow('not valid');
    });

    it('rejects a zero price', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQResponse.findUnique.mockResolvedValue(invitedResponse());
      await expect(svc.submitPublicQuote('tok', { quotedPriceCents: 0 })).rejects.toThrow('greater than zero');
    });

    it('refuses once the RFQ has been awarded', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQResponse.findUnique.mockResolvedValue(
        invitedResponse({ rfq: { id: 'rfq-1', businessId: 'biz-1', status: 'AWARDED', items: [] } }),
      );
      await expect(svc.submitPublicQuote('tok', { quotedPriceCents: 100 })).rejects.toThrow('closed');
    });

    it('lets a supplier replace their own earlier quote', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQResponse.findUnique.mockResolvedValue(invitedResponse({ status: 'PENDING' }));
      await expect(svc.submitPublicQuote('tok', { quotedPriceCents: 999 })).resolves.toMatchObject({
        submitted: true,
      });
    });
  });

  describe('getPublicQuote', () => {
    it('never exposes other suppliers or their prices', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQResponse.findUnique.mockResolvedValue({
        id: 'r-1', status: 'INVITED', quotedPriceCents: 0,
        supplier: { name: 'Acme' },
        rfq: {
          id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-9', status: 'SENT',
          notes: 'Urgent', deadline: null,
          items: [{ id: 'it-1', itemId: 'i-1', quantityNeeded: 5 }],
        },
      });
      prisma.item.findMany.mockResolvedValue([{ id: 'i-1', name: 'Milk 500ml' }]);

      const view = await svc.getPublicQuote('tok');

      expect(view.supplierName).toBe('Acme');
      expect(view.items).toEqual([{ id: 'it-1', name: 'Milk 500ml', quantityNeeded: 5 }]);
      expect(view.submitted).toBe(false);
      expect(view.quote).toBeNull();
      expect(JSON.stringify(view)).not.toContain('businessId');
    });

    it('marks an awarded RFQ as closed', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQResponse.findUnique.mockResolvedValue({
        id: 'r-1', status: 'REJECTED', quotedPriceCents: 5000, deliveryDays: 2,
        validUntil: null, notes: null, respondedAt: new Date(),
        supplier: { name: 'Acme' },
        rfq: { id: 'rfq-1', businessId: 'biz-1', rfqNumber: 'RFQ-9', status: 'AWARDED', notes: null, deadline: null, items: [] },
      });

      const view = await svc.getPublicQuote('tok');
      expect(view.closed).toBe(true);
      expect(view.quote?.quotedPriceCents).toBe(5000);
    });
  });

  describe('awardResponse', () => {
    it('will not award a supplier who never quoted', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({ id: 'rfq-1', businessId: 'biz-1' });
      prisma.rFQResponse.findFirst.mockResolvedValue({ id: 'r-1', status: 'INVITED' });

      await expect(svc.awardResponse('rfq-1', 'r-1', 'biz-1')).rejects.toThrow('not quoted yet');
    });

    it('leaves suppliers who never replied as INVITED rather than rejected', async () => {
      const { svc, prisma } = makeService();
      prisma.rFQ.findFirst.mockResolvedValue({ id: 'rfq-1', businessId: 'biz-1' });
      prisma.rFQResponse.findFirst.mockResolvedValue({ id: 'r-1', status: 'PENDING' });
      const tx = {
        rFQResponse: { updateMany: jest.fn(), update: jest.fn() },
        rFQ: { update: jest.fn().mockResolvedValue({ id: 'rfq-1', status: 'AWARDED' }) },
      };
      prisma.$transaction.mockImplementation((fn: any) => fn(tx));

      await svc.awardResponse('rfq-1', 'r-1', 'biz-1');

      expect(tx.rFQResponse.updateMany).toHaveBeenCalledWith({
        where: { rfqId: 'rfq-1', status: { not: 'INVITED' } },
        data: { status: 'REJECTED' },
      });
    });
  });
});
