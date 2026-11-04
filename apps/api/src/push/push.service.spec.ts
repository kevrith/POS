import { isValidExpoToken, buildExpoMessages, deliveryStatusMessage, PushService } from './push.service';

describe('isValidExpoToken', () => {
  it('accepts ExponentPushToken and ExpoPushToken forms', () => {
    expect(isValidExpoToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isValidExpoToken('ExpoPushToken[xyz-789]')).toBe(true);
  });

  it('rejects empty, malformed or non-Expo tokens', () => {
    expect(isValidExpoToken(undefined)).toBe(false);
    expect(isValidExpoToken(null)).toBe(false);
    expect(isValidExpoToken('')).toBe(false);
    expect(isValidExpoToken('abc123')).toBe(false);
    expect(isValidExpoToken('ExponentPushToken[]')).toBe(false);
    expect(isValidExpoToken('FCM[token]')).toBe(false);
  });
});

describe('buildExpoMessages', () => {
  const payload = { title: 'Hi', body: 'There', data: { type: 'delivery', id: 'd1' } };

  it('builds one message per valid token with sound + channel', () => {
    const msgs = buildExpoMessages(['ExponentPushToken[a]', 'ExpoPushToken[b]'], payload);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({
      to: 'ExponentPushToken[a]',
      title: 'Hi',
      body: 'There',
      sound: 'default',
      data: { type: 'delivery', id: 'd1' },
      channelId: 'default',
    });
  });

  it('skips invalid tokens and nulls', () => {
    const msgs = buildExpoMessages(['bad', null, undefined, 'ExponentPushToken[ok]'], payload);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].to).toBe('ExponentPushToken[ok]');
  });

  it('de-duplicates repeated tokens', () => {
    const msgs = buildExpoMessages(['ExponentPushToken[a]', 'ExponentPushToken[a]'], payload);
    expect(msgs).toHaveLength(1);
  });

  it('returns an empty array when there are no valid tokens', () => {
    expect(buildExpoMessages([null, 'nope'], payload)).toEqual([]);
  });
});

describe('deliveryStatusMessage', () => {
  it('maps customer-facing statuses to a title + body with the order number', () => {
    expect(deliveryStatusMessage('ASSIGNED', '1007')?.title).toBe('Driver on the way');
    expect(deliveryStatusMessage('IN_TRANSIT', '1007')?.title).toBe('Out for delivery');
    expect(deliveryStatusMessage('OUT_FOR_DELIVERY', '1007')?.title).toBe('Out for delivery');
    expect(deliveryStatusMessage('DELIVERED', '1007')?.body).toContain('#1007');
    expect(deliveryStatusMessage('FAILED', '1007')?.title).toBe('Delivery issue');
  });

  it('falls back gracefully without an order number', () => {
    expect(deliveryStatusMessage('DELIVERED')?.body).toContain('Your order');
  });

  it('returns null for internal statuses customers should not be pinged about', () => {
    expect(deliveryStatusMessage('PENDING')).toBeNull();
    expect(deliveryStatusMessage('ASSIGNED_TO_ROUTE')).toBeNull();
  });
});

describe('registerCustomerTokenById', () => {
  function makeService(count = 1) {
    const prisma = { customer: { updateMany: jest.fn().mockResolvedValue({ count }) } };
    return { svc: new PushService(prisma as never), prisma };
  }

  it('stores a valid token on the customer the portal session identified', async () => {
    const { svc, prisma } = makeService();
    const res = await svc.registerCustomerTokenById('cust-1', 'ExponentPushToken[abc]');
    expect(res).toEqual({ success: true });
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: { deviceToken: 'ExponentPushToken[abc]' },
    });
  });

  it('ignores a malformed token without touching the database', async () => {
    const { svc, prisma } = makeService();
    expect(await svc.registerCustomerTokenById('cust-1', 'not-a-token')).toEqual({ success: false });
    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
  });

  it('reports failure when no customer row matched', async () => {
    const { svc } = makeService(0);
    expect(await svc.registerCustomerTokenById('gone', 'ExponentPushToken[abc]')).toEqual({ success: false });
  });
});
