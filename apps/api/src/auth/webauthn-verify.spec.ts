import * as crypto from 'crypto';
import { verifyAssertionSignature } from './webauthn-verify';

/** What a device signs: authenticatorData, then the SHA-256 of clientDataJSON. */
function assertionData() {
  const authData = Buffer.concat([crypto.createHash('sha256').update('pos.example.com').digest(), Buffer.from([0x05]), Buffer.alloc(4, 1)]);
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'abc', origin: 'https://pos.example.com' }));
  return Buffer.concat([authData, crypto.createHash('sha256').update(clientDataJSON).digest()]);
}
const spki = (k: crypto.KeyObject) => k.export({ format: 'der', type: 'spki' }) as Buffer;

describe('verifyAssertionSignature', () => {
  it('accepts an ES256 signature in the DER form a device writes (the bug: every one of these was refused)', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const data = assertionData();
    // Node's default signature encoding for EC keys is DER, which is what authenticators produce
    const signature = crypto.sign('sha256', data, privateKey);
    expect(signature.length).toBeGreaterThan(64); // DER, not the raw 64-byte r||s that WebCrypto wanted
    expect(verifyAssertionSignature(spki(publicKey), data, signature)).toBe(true);
  });

  it('accepts an RS256 signature (Windows Hello on a TPM)', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const data = assertionData();
    expect(verifyAssertionSignature(spki(publicKey), data, crypto.sign('sha256', data, privateKey))).toBe(true);
  });

  it('refuses a signature made by a different key, over different data, or damaged', () => {
    const a = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const b = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const data = assertionData();
    const signature = crypto.sign('sha256', data, a.privateKey);
    expect(verifyAssertionSignature(spki(b.publicKey), data, signature)).toBe(false);
    expect(verifyAssertionSignature(spki(a.publicKey), Buffer.concat([data, Buffer.from('x')]), signature)).toBe(false);
    const damaged = Buffer.from(signature);
    damaged[damaged.length - 1] ^= 0xff;
    expect(verifyAssertionSignature(spki(a.publicKey), data, damaged)).toBe(false);
  });

  it('returns false, and never throws, for a key or signature it cannot read', () => {
    const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    expect(verifyAssertionSignature(Buffer.from('not a key'), assertionData(), Buffer.alloc(70))).toBe(false);
    expect(verifyAssertionSignature(spki(publicKey), assertionData(), Buffer.alloc(0))).toBe(false);
    expect(verifyAssertionSignature(Buffer.alloc(0), assertionData(), Buffer.alloc(70))).toBe(false);
  });

  it('refuses a key type that is not ES256 or RS256', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const data = assertionData();
    expect(verifyAssertionSignature(spki(publicKey), data, crypto.sign(null, data, privateKey))).toBe(false);
  });
});
