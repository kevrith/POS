import { normalizeKePhone, kePhoneVariants, toE164 } from './phone';

describe('normalizeKePhone', () => {
  it('accepts every shape a Kenyan number gets typed in', () => {
    for (const input of [
      '0712345678',
      '712345678',
      '254712345678',
      '+254712345678',
      '+254 712 345 678',
      '0712 345 678',
    ]) {
      expect(normalizeKePhone(input)).toBe('254712345678');
    }
  });

  it('rejects anything that is not a Kenyan MSISDN', () => {
    for (const input of ['', null, undefined, '0712', '25471234567890', 'not a phone']) {
      expect(normalizeKePhone(input)).toBeNull();
    }
  });
});

describe('kePhoneVariants', () => {
  it('covers the shapes older rows were stored under', () => {
    expect(kePhoneVariants('254712345678')).toEqual([
      '254712345678',
      '+254712345678',
      '0712345678',
      '712345678',
    ]);
  });
});

describe('toE164', () => {
  it('adds the leading + Africa\'s Talking expects', () => {
    expect(toE164('0712345678')).toBe('+254712345678');
  });

  it('passes an already-international number through', () => {
    expect(toE164('+14155550123')).toBe('+14155550123');
  });

  it('refuses to guess at an unroutable number', () => {
    expect(toE164('12345')).toBeNull();
  });
});
