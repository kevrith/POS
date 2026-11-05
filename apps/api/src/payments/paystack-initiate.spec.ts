import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';

const ORIGINAL_KEY = process.env.PAYSTACK_SECRET_KEY;
const req = (businessId = 'biz-1') => ({ user: { businessId } }) as any;
const make = () => new PaymentsController({} as any, {} as any, {} as any);
const ok = { amountCents: 150000, email: 'payer@example.com' };

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = ORIGINAL_KEY;
  jest.restoreAllMocks();
});

describe('PaymentsController.initiatePaystack', () => {
  it('refuses when no secret key is configured, instead of pretending to start a payment', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(make().initiatePaystack(ok, req())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([[0], [-5], [99], [1.5], ['abc'], [undefined]])('refuses an amount of %p', async (amountCents) => {
    process.env.PAYSTACK_SECRET_KEY = 'test-key';
    await expect(make().initiatePaystack({ ...ok, amountCents: amountCents as any }, req())).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([[''], ['not-an-email'], ['a@b']])('refuses the email %p', async (email) => {
    process.env.PAYSTACK_SECRET_KEY = 'test-key';
    await expect(make().initiatePaystack({ ...ok, email }, req())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('starts the payment for the signed-in business and returns the page to pay on', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'test-key';
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: true, data: { authorization_url: 'https://checkout.example/abc', reference: 'REF-1' } }),
    } as any);
    const res = await make().initiatePaystack(ok, req('biz-1'));
    expect(res).toEqual({ authorizationUrl: 'https://checkout.example/abc', reference: 'REF-1' });
    const sent = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(sent).toMatchObject({ amount: 150000, currency: 'KES', email: 'payer@example.com' });
    expect(sent.metadata.businessId).toBe('biz-1');
  });

  it("passes on Paystack's own message when it declines", async () => {
    process.env.PAYSTACK_SECRET_KEY = 'test-key';
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 400, json: async () => ({ status: false, message: 'Invalid amount' }) } as any);
    await expect(make().initiatePaystack(ok, req())).rejects.toThrow('Invalid amount');
  });

  it('reports a Paystack outage as unavailable, not as a bad request', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'test-key';
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(make().initiatePaystack(ok, req())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
