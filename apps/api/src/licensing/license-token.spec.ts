import { generateLicenseKeyPair, LicensePayload, signLicense, toPem, verifyLicense } from './license-token';

const payload = (over: Partial<LicensePayload> = {}): LicensePayload => ({
  v: 1, lid: 'lic-1', tier: 'PRO', machineId: 'machine-a', issuedAt: '2026-11-08T00:00:00.000Z',
  tokenExpiresAt: '2026-12-08T00:00:00.000Z', licenseExpiresAt: '2027-11-08T00:00:00.000Z', ...over,
});

describe('the signed licence', () => {
  const server = generateLicenseKeyPair();
  const stranger = generateLicenseKeyPair();

  it('is accepted with the matching public key, and says what was signed', () => {
    const token = signLicense(payload(), server.privateKeyPem);
    const r = verifyLicense(token, server.publicKeyPem);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual(payload());
  });

  it('cannot be made by anyone without the private key: a licence signed with another key is refused', () => {
    const forged = signLicense(payload(), stranger.privateKeyPem);
    expect(verifyLicense(forged, server.publicKeyPem)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('cannot be edited: changing the plan or the date breaks the signature', () => {
    const token = signLicense(payload({ tier: 'STARTER' }), server.privateKeyPem);
    const [prefix, body, sig] = token.split('.');
    const edited = JSON.parse(Buffer.from(body, 'base64url').toString());
    edited.tier = 'ENTERPRISE';
    const upgraded = `${prefix}.${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${sig}`;
    expect(verifyLicense(upgraded, server.publicKeyPem)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
    const later = { ...edited, tier: 'STARTER', tokenExpiresAt: '2099-01-01T00:00:00.000Z' };
    const extended = `${prefix}.${Buffer.from(JSON.stringify(later)).toString('base64url')}.${sig}`;
    expect(verifyLicense(extended, server.publicKeyPem)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects garbage without throwing', () => {
    for (const bad of ['', 'nonsense', 'a.b', 'kl1.only', 'kl1..', 'x.y.z.w']) {
      expect(verifyLicense(bad, server.publicKeyPem).ok).toBe(false);
    }
    expect(verifyLicense(signLicense(payload(), server.privateKeyPem), 'not a key').ok).toBe(false);
  });

  it('rejects a token from a different scheme version', () => {
    const token = signLicense(payload(), server.privateKeyPem).replace(/^kl1\./, 'kl9.');
    expect(verifyLicense(token, server.publicKeyPem)).toEqual({ ok: false, reason: 'UNSUPPORTED' });
  });

  it('takes keys as plain PEM or as one line of base64 (easy to keep in an environment variable)', () => {
    const asBase64 = Buffer.from(server.privateKeyPem).toString('base64');
    expect(toPem(asBase64)).toBe(server.privateKeyPem.trim());
    expect(toPem(server.publicKeyPem)).toBe(server.publicKeyPem.trim());
    const token = signLicense(payload(), asBase64);
    expect(verifyLicense(token, Buffer.from(server.publicKeyPem).toString('base64')).ok).toBe(true);
  });
});
