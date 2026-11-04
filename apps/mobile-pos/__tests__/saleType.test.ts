import { saleTypeFor } from '../lib/saleType';

describe('saleTypeFor', () => {
  it('is CREDIT when any payment is on credit, as the web till does', () => {
    expect(saleTypeFor([{ method: 'CREDIT' }])).toBe('CREDIT');
    expect(saleTypeFor([{ method: 'CASH' }, { method: 'CREDIT' }])).toBe('CREDIT');
  });

  it('is NORMAL for everything else', () => {
    expect(saleTypeFor([{ method: 'CASH' }])).toBe('NORMAL');
    expect(saleTypeFor([{ method: 'MPESA' }, { method: 'CARD' }])).toBe('NORMAL');
    expect(saleTypeFor([])).toBe('NORMAL');
  });
});
