import { CustomersService } from './customers.service';

function makeCustomer(overrides: Record<string, any> = {}) {
  return { id: 'cust-1', businessId: 'biz-1', name: 'Alice', phone: '0712345678', email: 'alice@example.com', loyaltyPoints: 100, creditBalance: 0, ...overrides };
}

function makePrisma() {
  return {
    customer: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    layaway: { findMany: jest.fn().mockResolvedValue([]) },
    creditNote: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const svc = new CustomersService(prisma);
  return { svc, prisma };
}

describe('CustomersService', () => {
  describe('create', () => {
    it('creates a customer with the provided data', async () => {
      const customer = makeCustomer();
      const { svc, prisma } = makeService();
      prisma.customer.create.mockResolvedValue(customer);
      const result = await svc.create('biz-1', { name: 'Alice', phone: '0712345678' } as any);
      expect(prisma.customer.create).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('Alice');
    });
  });

  describe('findAll', () => {
    it('returns customers for a businessId', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findMany.mockResolvedValue([makeCustomer()]);
      const result = await svc.findAll('biz-1');
      expect(result).toHaveLength(1);
      expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ businessId: 'biz-1' }),
      }));
    });

    it('applies search filter when provided', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findMany.mockResolvedValue([]);
      await svc.findAll('biz-1', 'ali');
      const where = prisma.customer.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('returns a customer by id', async () => {
      const customer = makeCustomer();
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(customer);
      const result = await svc.findOne('cust-1', 'biz-1');
      expect(result?.id).toBe('cust-1');
    });

    it('returns null when customer not found', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(null);
      const result = await svc.findOne('bad', 'biz-1');
      expect(result).toBeNull();
    });
  });

  describe('getCustomerSegmentation', () => {
    it('returns empty segments when no customers have sales', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findMany.mockResolvedValue([
        { ...makeCustomer(), sales: [] },
      ]);
      const result = await svc.getCustomerSegmentation('biz-1');
      expect(result.segments).toHaveLength(0);
    });

    it('segments customers with sales into RFM buckets', async () => {
      const { svc, prisma } = makeService();
      const recentDate = new Date(Date.now() - 2 * 86400000);
      prisma.customer.findMany.mockResolvedValue([
        { ...makeCustomer(), sales: [
          { id: 's1', totalCents: 500000, createdAt: recentDate },
          { id: 's2', totalCents: 300000, createdAt: new Date(Date.now() - 5 * 86400000) },
        ]},
      ]);
      const result = await svc.getCustomerSegmentation('biz-1');
      expect(result.customers).toHaveLength(1);
      expect(result.segments.length).toBeGreaterThan(0);
    });
  });

  describe('findDuplicates', () => {
    it('groups customers by phone number', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findMany.mockResolvedValue([
        makeCustomer({ id: 'c1', phone: '0712345678' }),
        makeCustomer({ id: 'c2', phone: '0712345678' }),
        makeCustomer({ id: 'c3', phone: '0799999999' }),
      ]);
      const result = await svc.findDuplicates('biz-1');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});
