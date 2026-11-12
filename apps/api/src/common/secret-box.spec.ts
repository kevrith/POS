import { openSecret, sealSecret } from './secret-box';

describe('secret-box', () => {
  const before = process.env.ENCRYPTION_KEY;
  afterEach(() => { process.env.ENCRYPTION_KEY = before; });

  it('round-trips, with a different sealed text each time', () => {
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    const a = sealSecret('s3cret value');
    const b = sealSecret('s3cret value');
    expect(a).not.toBe(b);
    expect(a).not.toContain('s3cret');
    expect(openSecret(a)).toBe('s3cret value');
  });

  it('refuses to store anything without a real key (no built-in fallback)', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => sealSecret('x')).toThrow(/encryption key/);
    process.env.ENCRYPTION_KEY = 'short';
    expect(() => sealSecret('x')).toThrow(/encryption key/);
  });

  it('says plainly when the stored text cannot be read with this key', () => {
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    const sealed = sealSecret('x');
    process.env.ENCRYPTION_KEY = 'cd'.repeat(32);
    expect(() => openSecret(sealed)).toThrow(/cannot be read/);
    expect(() => openSecret('garbage')).toThrow(/unreadable/);
  });
});
