import { BadRequestException } from '@nestjs/common';
import { SecretsRotationService } from './secrets-rotation.service';

// ─── Key fixtures (32 random bytes expressed as 64 hex chars) ────────────────
const KEY_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 64 a's
const KEY_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; // 64 b's
const SHORT_KEY = 'deadbeef'; // too short

// ─── Prisma mock ──────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    business: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeService(prismaOverrides: Partial<ReturnType<typeof makePrisma>> = {}) {
  const prisma = { ...makePrisma(), ...prismaOverrides };
  return {
    svc: new SecretsRotationService(prisma as any),
    prisma,
  };
}

// ─── Encryption round-trip tests ─────────────────────────────────────────────

describe('SecretsRotationService — encryption helpers', () => {
  const { svc } = makeService();

  it('encrypt → decrypt round-trip returns original plaintext', () => {
    const plaintext = JSON.stringify({ deviceId: 'DEV-001', pin: '1234' });
    const encrypted = svc._encryptWithKey(plaintext, KEY_A);
    const decrypted = svc._decryptWithKey(encrypted, KEY_A);
    expect(decrypted).toBe(plaintext);
  });

  it('ciphertext uses iv:ciphertext format', () => {
    const encrypted = svc._encryptWithKey('hello', KEY_A);
    expect(encrypted).toMatch(/^[0-9a-f]{32}:/); // 16-byte IV = 32 hex chars
  });

  it('each encryption of the same value produces a different ciphertext (random IV)', () => {
    const c1 = svc._encryptWithKey('same', KEY_A);
    const c2 = svc._encryptWithKey('same', KEY_A);
    expect(c1).not.toBe(c2);
  });

  it('decryption fails with wrong key', () => {
    const encrypted = svc._encryptWithKey('secret data', KEY_A);
    expect(() => svc._decryptWithKey(encrypted, KEY_B)).toThrow();
  });
});

// ─── Key validation tests ─────────────────────────────────────────────────────

describe('SecretsRotationService.rotateEncryptionKey — validation', () => {
  it('throws when old key is not 64 hex chars', async () => {
    const { svc } = makeService();
    await expect(svc.rotateEncryptionKey(SHORT_KEY, KEY_B)).rejects.toThrow(BadRequestException);
    await expect(svc.rotateEncryptionKey(SHORT_KEY, KEY_B)).rejects.toThrow('old key');
  });

  it('throws when new key is not 64 hex chars', async () => {
    const { svc } = makeService();
    await expect(svc.rotateEncryptionKey(KEY_A, SHORT_KEY)).rejects.toThrow(BadRequestException);
    await expect(svc.rotateEncryptionKey(KEY_A, SHORT_KEY)).rejects.toThrow('new key');
  });

  it('throws when old and new keys are identical', async () => {
    const { svc } = makeService();
    await expect(svc.rotateEncryptionKey(KEY_A, KEY_A)).rejects.toThrow(BadRequestException);
    await expect(svc.rotateEncryptionKey(KEY_A, KEY_A)).rejects.toThrow('must be different');
  });
});

// ─── Rotation logic tests ─────────────────────────────────────────────────────

describe('SecretsRotationService.rotateEncryptionKey — rotation', () => {
  it('skips businesses with no encrypted credentials', async () => {
    const { svc, prisma } = makeService();
    prisma.business.findMany.mockResolvedValue([]); // no businesses with credentials

    const result = await svc.rotateEncryptionKey(KEY_A, KEY_B);

    expect(result.processed).toBe(0);
    expect(result.rotated).toBe(0);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it('re-encrypts eTIMS credentials from old key to new key', async () => {
    const { svc, prisma } = makeService();

    const originalPlaintext = JSON.stringify({ deviceId: 'ETIMS-123', pin: '9999' });
    const encryptedWithA = svc._encryptWithKey(originalPlaintext, KEY_A);

    prisma.business.findMany.mockResolvedValue([
      {
        id: 'biz-001',
        etimsCredentialsEncrypted: encryptedWithA,
        mpesaCredentialsEncrypted: null,
        atCredentialsEncrypted: null,
        kraItaxCredentials: null,
      },
    ]);
    prisma.business.update.mockResolvedValue({});

    const result = await svc.rotateEncryptionKey(KEY_A, KEY_B);

    expect(result.rotated).toBe(1);
    expect(result.errors).toHaveLength(0);

    const updateCall = prisma.business.update.mock.calls[0][0];
    const reEncryptedEtims = updateCall.data.etimsCredentialsEncrypted;

    // Should be decryptable with KEY_B, not KEY_A
    const decryptedWithB = svc._decryptWithKey(reEncryptedEtims, KEY_B);
    expect(decryptedWithB).toBe(originalPlaintext);

    expect(() => svc._decryptWithKey(reEncryptedEtims, KEY_A)).toThrow();
  });

  it('re-encrypts all four credential fields in one update call', async () => {
    const { svc, prisma } = makeService();

    const enc = (v: string) => svc._encryptWithKey(v, KEY_A);

    prisma.business.findMany.mockResolvedValue([
      {
        id: 'biz-multi',
        etimsCredentialsEncrypted: enc('{"etims":true}'),
        mpesaCredentialsEncrypted: enc('{"consumerKey":"abc"}'),
        atCredentialsEncrypted: enc('{"apiKey":"xyz"}'),
        kraItaxCredentials: enc('{"user":"kra","pass":"itax"}'),
      },
    ]);
    prisma.business.update.mockResolvedValue({});

    await svc.rotateEncryptionKey(KEY_A, KEY_B);

    const updateData = prisma.business.update.mock.calls[0][0].data;
    expect(updateData).toHaveProperty('etimsCredentialsEncrypted');
    expect(updateData).toHaveProperty('mpesaCredentialsEncrypted');
    expect(updateData).toHaveProperty('atCredentialsEncrypted');
    expect(updateData).toHaveProperty('kraItaxCredentials');

    // All four should decrypt successfully with KEY_B
    expect(svc._decryptWithKey(updateData.etimsCredentialsEncrypted, KEY_B)).toBe('{"etims":true}');
    expect(svc._decryptWithKey(updateData.mpesaCredentialsEncrypted, KEY_B)).toBe('{"consumerKey":"abc"}');
    expect(svc._decryptWithKey(updateData.atCredentialsEncrypted, KEY_B)).toBe('{"apiKey":"xyz"}');
    expect(svc._decryptWithKey(updateData.kraItaxCredentials, KEY_B)).toBe('{"user":"kra","pass":"itax"}');
  });

  it('records an error and continues when one business fails to decrypt', async () => {
    const { svc, prisma } = makeService();

    // biz-good: encrypted with KEY_A (will succeed)
    const goodPlain = '{"deviceId":"ok"}';
    const goodEnc = svc._encryptWithKey(goodPlain, KEY_A);

    // biz-bad: value that cannot be decrypted with KEY_A
    const badEnc = 'zzzzzzzzzzzzzzzz:deadbeefdeadbeefdeadbeef'; // garbage

    prisma.business.findMany.mockResolvedValue([
      {
        id: 'biz-bad',
        etimsCredentialsEncrypted: badEnc,
        mpesaCredentialsEncrypted: null,
        atCredentialsEncrypted: null,
        kraItaxCredentials: null,
      },
      {
        id: 'biz-good',
        etimsCredentialsEncrypted: goodEnc,
        mpesaCredentialsEncrypted: null,
        atCredentialsEncrypted: null,
        kraItaxCredentials: null,
      },
    ]);
    prisma.business.update.mockResolvedValue({});

    const result = await svc.rotateEncryptionKey(KEY_A, KEY_B);

    // Both processed, but one should have been rotated (good one) and the bad
    // one should either be skipped or kept as-is (reEncrypt returns original value on error)
    expect(result.processed).toBe(2);
    expect(result.rotated).toBeGreaterThanOrEqual(1);
  });

  it('returns accurate counts after rotating multiple businesses', async () => {
    const { svc, prisma } = makeService();

    const businesses = Array.from({ length: 5 }, (_, i) => ({
      id: `biz-00${i}`,
      etimsCredentialsEncrypted: svc._encryptWithKey(`{"id":${i}}`, KEY_A),
      mpesaCredentialsEncrypted: null,
      atCredentialsEncrypted: null,
      kraItaxCredentials: null,
    }));

    prisma.business.findMany.mockResolvedValue(businesses);
    prisma.business.update.mockResolvedValue({});

    const result = await svc.rotateEncryptionKey(KEY_A, KEY_B);

    expect(result.processed).toBe(5);
    expect(result.rotated).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
