import { ForbiddenException } from '@nestjs/common';
import { ChannelManagerController, CHANNEL_WRITE_SCOPE } from './channel-manager.controller';

function setup() {
  const svc = { receiveWebhook: jest.fn().mockResolvedValue({ ok: true }) };
  const ctrl = new ChannelManagerController(svc as any);
  const req = (scopes: string[]) => ({ apiKey: { businessId: 'biz-from-key', scopes } }) as any;
  return { svc, ctrl, req };
}

describe('ChannelManagerController.webhook', () => {
  it('posts into the business that owns the API key, never one named elsewhere', async () => {
    const { svc, ctrl, req } = setup();
    await ctrl.webhook('booking_com', { id: 'x' }, 'store-1', req([CHANNEL_WRITE_SCOPE]));
    expect(svc.receiveWebhook).toHaveBeenCalledWith('booking_com', { id: 'x' }, 'biz-from-key', 'store-1');
  });

  it('refuses a key that was not issued the bookings:write scope', () => {
    const { svc, ctrl, req } = setup();
    expect(() => ctrl.webhook('booking_com', {}, 'store-1', req(['sales:read']))).toThrow(ForbiddenException);
    expect(svc.receiveWebhook).not.toHaveBeenCalled();
  });
});
