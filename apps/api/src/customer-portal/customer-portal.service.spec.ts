import { createHash } from 'crypto';
import { CustomerPortalService } from './customer-portal.service';

function hash(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

function makePrisma() {
  return {
    customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    customerPortalSession: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    business: { findUnique: jest.fn().mockResolvedValue({ name: 'Wazi Biz' }) },
  };
}

function makeService(overrides: Record<string, any> = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const notifications = { sendSMS: jest.fn().mockResolvedValue({ success: true }) };
  return { svc: new CustomerPortalService(prisma, notifications as any), prisma, notifications };
}

const CUSTOMER = { id: 'cust-1', name: 'Kev', phone: '254712345678', shopCode: null, phoneVerifiedAt: null };

describe('CustomerPortalService — OTP limits', () => {
  describe('requestOtp', () => {
    it('sends a code and records when it went out', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);

      await svc.requestOtp('254712345678', 'biz-1');

      expect(notifications.sendSMS).toHaveBeenCalledTimes(1);
      const data = prisma.customerPortalSession.upsert.mock.calls[0][0].update;
      expect(data.otpAttempts).toBe(0);
      expect(data.otpSentAt).toBeInstanceOf(Date);
    });

    it('refuses a resend inside the cooldown', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findUnique.mockResolvedValue({
        otpSentAt: new Date(Date.now() - 10_000), // 10s ago
      });

      await expect(svc.requestOtp('254712345678', 'biz-1')).rejects.toThrow(/wait \d+s/);
      expect(notifications.sendSMS).not.toHaveBeenCalled();
      expect(prisma.customerPortalSession.upsert).not.toHaveBeenCalled();
    });

    it('allows a resend once the cooldown has passed', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findUnique.mockResolvedValue({
        otpSentAt: new Date(Date.now() - 61_000),
      });

      await svc.requestOtp('254712345678', 'biz-1');
      expect(notifications.sendSMS).toHaveBeenCalledTimes(1);
    });

    it('does not echo the OTP outside development', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { svc, prisma } = makeService();
        prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
        const res = await svc.requestOtp('254712345678', 'biz-1');
        expect(res).not.toHaveProperty('otp');
      } finally {
        process.env.NODE_ENV = previous;
      }
    });
  });

  describe('verifyOtp', () => {
    function pendingSession(overrides: Record<string, any> = {}) {
      return {
        id: 'sess-1',
        customerId: 'cust-1',
        otpHash: hash('123456'),
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
        ...overrides,
      };
    }

    it('counts a wrong code and says how many tries are left', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findFirst.mockResolvedValue(pendingSession({ otpAttempts: 1 }));

      await expect(svc.verifyOtp('254712345678', '000000', 'biz-1')).rejects.toThrow(
        '3 attempts left',
      );
      expect(prisma.customerPortalSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ otpAttempts: 2 }) }),
      );
    });

    it('burns the code on the final wrong attempt', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findFirst.mockResolvedValue(pendingSession({ otpAttempts: 4 }));

      await expect(svc.verifyOtp('254712345678', '000000', 'biz-1')).rejects.toThrow(
        'Too many incorrect codes',
      );
      const data = prisma.customerPortalSession.update.mock.calls[0][0].data;
      expect(data.otpAttempts).toBe(5);
      expect(data.otpExpiresAt).toBeInstanceOf(Date); // expired immediately
    });

    it('refuses even the correct code once the cap is reached', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findFirst.mockResolvedValue(pendingSession({ otpAttempts: 5 }));

      await expect(svc.verifyOtp('254712345678', '123456', 'biz-1')).rejects.toThrow(
        'Too many incorrect codes',
      );
      expect(prisma.customerPortalSession.create).not.toHaveBeenCalled();
    });

    it('still lets the right code through within the limit', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findFirst.mockResolvedValue(pendingSession({ otpAttempts: 2 }));
      prisma.customer.update.mockResolvedValue({ name: 'Kev', shopCode: null });

      const res = await svc.verifyOtp('254712345678', '123456', 'biz-1');

      expect(res.sessionToken).toHaveLength(64); // 32 random bytes, hex
      expect(prisma.customerPortalSession.delete).toHaveBeenCalled();
      expect(prisma.customerPortalSession.create).toHaveBeenCalled();
    });

    it('stores only a hash of the session token', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findFirst.mockResolvedValue(pendingSession());
      prisma.customer.update.mockResolvedValue({ name: 'Kev', shopCode: null });

      const res = await svc.verifyOtp('254712345678', '123456', 'biz-1');

      const stored = prisma.customerPortalSession.create.mock.calls[0][0].data.sessionToken;
      expect(stored).toBe(hash(res.sessionToken));
      expect(stored).not.toBe(res.sessionToken);
    });
  });

  describe('phone normalization', () => {
    it('finds one customer however the number was typed', async () => {
      for (const typed of ['0712345678', '+254 712 345 678', '712345678', '254712345678']) {
        const { svc, prisma } = makeService();
        prisma.customer.findFirst.mockResolvedValue(CUSTOMER);

        await svc.requestOtp(typed, 'biz-1');

        // One lookup, matching every shape the row could already be stored under.
        expect(prisma.customer.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              businessId: 'biz-1',
              phone: { in: ['254712345678', '+254712345678', '0712345678', '712345678'] },
            },
          }),
        );
        expect(prisma.customer.create).not.toHaveBeenCalled();
      }
    });

    it('rewrites a legacy row to the canonical number', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue({ ...CUSTOMER, phone: '0712345678' });

      await svc.requestOtp('0712345678', 'biz-1');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { phone: '254712345678' },
      });
    });

    it('stores a new customer canonically rather than as typed', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({ ...CUSTOMER, name: 'Customer' });

      await svc.requestOtp('0712345678', 'biz-1');

      expect(prisma.customer.create.mock.calls[0][0].data.phone).toBe('254712345678');
    });

    it('rejects a number that is not a Kenyan mobile', async () => {
      const { svc, prisma, notifications } = makeService();
      await expect(svc.requestOtp('0712', 'biz-1')).rejects.toThrow(/valid Kenyan mobile/);
      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(notifications.sendSMS).not.toHaveBeenCalled();
    });

    it('verifies against a customer stored under an older shape', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customerPortalSession.findFirst.mockResolvedValue({
        id: 'sess-1', customerId: 'cust-1', otpHash: hash('123456'),
        otpExpiresAt: new Date(Date.now() + 60_000), otpAttempts: 0,
      });
      prisma.customer.update.mockResolvedValue({ name: 'Kev', shopCode: null });

      await svc.verifyOtp('0712345678', '123456', 'biz-1');

      expect(prisma.customer.update.mock.calls[0][0].data.phone).toBe('254712345678');
    });
  });

  describe('SMS delivery', () => {
    it('fails the request when the code could not be sent', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { svc, prisma, notifications } = makeService();
        prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
        notifications.sendSMS.mockResolvedValue({ success: false, error: 'Messaging not configured' });

        await expect(svc.requestOtp('254712345678', 'biz-1')).rejects.toThrow(/cannot send login codes right now/);

        // The code is burned and the cooldown cleared — the customer never got a
        // code, so they should not be made to wait 60s to try again.
        const data = prisma.customerPortalSession.update.mock.calls[0][0].data;
        expect(data.otpSentAt).toBeNull();
        expect(data.otpExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('sends the login code as an OTP so it goes out on the platform account', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);

      await svc.requestOtp('254712345678', 'biz-1');

      expect(notifications.sendSMS).toHaveBeenCalledWith(
        'biz-1', '254712345678', expect.stringContaining('verification code'), { purpose: 'OTP' },
      );
    });

    it('answers 429, not 503, when a send cap is hit, and burns the unsent code', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { svc, prisma, notifications } = makeService();
        prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
        notifications.sendSMS.mockResolvedValue({ success: false, error: 'SMS limit reached for this business', limited: true });

        await expect(svc.requestOtp('254712345678', 'biz-1')).rejects.toMatchObject({ status: 429 });
        expect(prisma.customerPortalSession.update.mock.calls[0][0].data.otpSentAt).toBeNull();
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('keeps the echoed code alive in development when SMS is unconfigured', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      notifications.sendSMS.mockResolvedValue({ success: false, error: 'Messaging not configured' });

      const res = await svc.requestOtp('254712345678', 'biz-1');

      expect(res.otp).toMatch(/^\d{6}$/);
      expect(prisma.customerPortalSession.update).not.toHaveBeenCalled();
    });

    it('publishes the timings the client counts down against', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);

      const res = await svc.requestOtp('254712345678', 'biz-1');

      expect(res.expiresInSeconds).toBe(600);
      expect(res.resendInSeconds).toBe(60);
    });
  });

  describe('pruneExpiredSessions', () => {
    it('removes only sessions whose expiry has passed', async () => {
      const { svc, prisma } = makeService();
      prisma.customerPortalSession.deleteMany.mockResolvedValue({ count: 3 });

      const res = await svc.pruneExpiredSessions();

      expect(res.removed).toBe(3);
      const where = prisma.customerPortalSession.deleteMany.mock.calls[0][0].where;
      expect(where.expiresAt.lt).toBeInstanceOf(Date);
    });
  });
});
