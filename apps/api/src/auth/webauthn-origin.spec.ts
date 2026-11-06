import { BadRequestException } from '@nestjs/common';
import { pageOrigin, resolveRelyingParty } from './webauthn-origin';

const env = { FRONTEND_URL: 'https://pos.example.com', ADMIN_URL: 'https://admin.example.com' } as NodeJS.ProcessEnv;

describe('resolveRelyingParty', () => {
  it('uses the page host as the RP ID (the old hardcoded "localhost" broke every real domain)', () => {
    expect(resolveRelyingParty('https://pos.example.com', env)).toEqual({ rpId: 'pos.example.com', origin: 'https://pos.example.com' });
  });
  it('allows http://localhost for development, any port', () => {
    expect(resolveRelyingParty('http://localhost:3005', env).rpId).toBe('localhost');
  });
  it('refuses plain http and IP addresses, with a message the user can act on', () => {
    expect(() => resolveRelyingParty('http://pos.example.com', env)).toThrow(/https/);
    expect(() => resolveRelyingParty('https://192.168.1.20', env)).toThrow(/IP address/);
    expect(() => resolveRelyingParty('http://192.168.1.20:3005', env)).toThrow(BadRequestException);
  });
  it('refuses origins that are not ours', () => {
    expect(() => resolveRelyingParty('https://evil.example.org', env)).toThrow(/not allowed/);
  });
  it('lets WEBAUTHN_RP_ID widen to a parent domain, but only for a matching host', () => {
    const wide = { ...env, WEBAUTHN_RP_ID: 'example.com' };
    expect(resolveRelyingParty('https://pos.example.com', wide).rpId).toBe('example.com');
    expect(() => resolveRelyingParty('https://pos.example.com', { ...env, WEBAUTHN_RP_ID: 'other.com' })).toThrow();
  });
  it('needs an origin', () => {
    expect(() => resolveRelyingParty(undefined, env)).toThrow(BadRequestException);
  });
});

describe('pageOrigin', () => {
  it('falls back to the Referer when the browser sent no Origin (same-origin GET)', () => {
    expect(pageOrigin(undefined, 'https://pos.example.com/settings?x=1')).toBe('https://pos.example.com');
    expect(pageOrigin('null', 'https://pos.example.com/a')).toBe('https://pos.example.com');
    expect(pageOrigin('https://a.com', 'https://b.com/')).toBe('https://a.com');
  });
});
