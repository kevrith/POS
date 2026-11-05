import { etimsPaymentType } from './etims-payment';

const pay = (method: string, amountCents = 100) => ({ method, amountCents });

describe('etimsPaymentType', () => {
  it.each([
    ['cash', [pay('CASH')], '01'],
    ['M-Pesa', [pay('MPESA_STK')], '06'],
    ['card', [pay('CARD')], '05'],
    ['bank', [pay('BANK_TRANSFER')], '04'],
    ['an insurer paying the whole bill', [pay('INSURANCE')], '02'],
    ['a sale charged to a room', [pay('ROOM_CHARGE')], '02'],
    ['a deposit already held', [pay('DEPOSIT')], '07'],
    ['a gift card', [pay('GIFT_CARD')], '07'],
  ])('%s', (_label, payments, code) => {
    expect(etimsPaymentType(payments)).toBe(code);
  });

  it('a credit sale with nothing paid is credit; a sale with no payments at all is cash', () => {
    expect(etimsPaymentType([], true)).toBe('02');
    expect(etimsPaymentType([], false)).toBe('01');
  });

  it('part paid, part owed by an insurer is cash and credit', () => {
    expect(etimsPaymentType([pay('CASH', 8400), pay('INSURANCE', 33600)])).toBe('03');
  });

  it('several ways of being paid: the biggest decides', () => {
    expect(etimsPaymentType([pay('CASH', 1000), pay('MPESA', 5000)])).toBe('06');
    expect(etimsPaymentType([pay('DEPOSIT', 30000), pay('CASH', 10000)])).toBe('07');
  });
});
