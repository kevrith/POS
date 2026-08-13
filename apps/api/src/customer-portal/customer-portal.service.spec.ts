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
    },
    business: { findUnique: jest.fn().mockResolvedValue({ name: 'Wazi Biz' }) },
  };
}

function makeService(overrides: Record<string, any> = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const notifications = { sendSMS: jest.fn().mockResolvedValue({ success: true }) };
  return { svc: new CustomerPortalService(prisma, notifications as any), prisma, notifications };
}

const CUSTOMER = { id: 'cust-1', name: 'Kev', shopCode: null, phoneVerifiedAt: null };

describe('CustomerPortalService — OTP limits', () => {
  describe('requestOtp', () => {
    it('sends a code and records when it went out', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', name: 'Kev' });

      await svc.requestOtp('254712345678', 'biz-1');

      expect(notifications.sendSMS).toHaveBeenCalledTimes(1);
      const data = prisma.customerPortalSession.upsert.mock.calls[0][0].update;
      expect(data.otpAttempts).toBe(0);
      expect(data.otpSentAt).toBeInstanceOf(Date);
    });

    it('refuses a resend inside the cooldown', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', name: 'Kev' });
      prisma.customerPortalSession.findUnique.mockResolvedValue({
        otpSentAt: new Date(Date.now() - 10_000), // 10s ago
      });

      await expect(svc.requestOtp('254712345678', 'biz-1')).rejects.toThrow(/wait \d+s/);
      expect(notifications.sendSMS).not.toHaveBeenCalled();
      expect(prisma.customerPortalSession.upsert).not.toHaveBeenCalled();
    });

    it('allows a resend once the cooldown has passed', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', name: 'Kev' });
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
        prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', name: 'Kev' });
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
});
