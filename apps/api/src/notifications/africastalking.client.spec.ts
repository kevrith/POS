import { createAtClient } from './africastalking.client';

const OK = { SMSMessageData: { Recipients: [{ status: 'Success', messageId: 'm1' }] } };

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('createAtClient', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('posts a form-encoded message to the live endpoint with the api key header', async () => {
    const fetchMock = mockFetch(201, OK);
    const res = await createAtClient({ apiKey: 'k', username: 'shop' }).SMS.send({ to: ['+254700000001', '+254700000002'], message: 'hi', from: 'SHOP' });

    expect(res).toEqual(OK);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.africastalking.com/version1/messaging');
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBe('k');
    expect(init.body.get('username')).toBe('shop');
    expect(init.body.get('to')).toBe('+254700000001,+254700000002');
    expect(init.body.get('message')).toBe('hi');
    expect(init.body.get('from')).toBe('SHOP');
  });

  it('omits the sender id when none is given', async () => {
    const fetchMock = mockFetch(201, OK);
    await createAtClient({ apiKey: 'k', username: 'shop' }).SMS.send({ to: ['+254700000001'], message: 'hi' });
    expect(fetchMock.mock.calls[0][1].body.has('from')).toBe(false);
  });

  it('uses the sandbox host for the sandbox account', async () => {
    const fetchMock = mockFetch(201, OK);
    await createAtClient({ apiKey: 'k', username: 'Sandbox' }).SMS.send({ to: ['+254700000001'], message: 'hi' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sandbox.africastalking.com/version1/messaging');
  });

  it('rejects when AT does not answer 201', async () => {
    mockFetch(401, 'The supplied authentication is invalid');
    await expect(createAtClient({ apiKey: 'bad', username: 'shop' }).SMS.send({ to: ['+254700000001'], message: 'hi' }))
      .rejects.toThrow(/responded 401: The supplied authentication is invalid/);
  });
});
