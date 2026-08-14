import { newDeliveryOrderNumber } from './order-number';

describe('newDeliveryOrderNumber', () => {
  it('is not derived from the clock', () => {
    const a = newDeliveryOrderNumber();
    const b = newDeliveryOrderNumber();
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/\d{10,}/); // no embedded epoch to walk
  });

  it('uses an unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(newDeliveryOrderNumber()).toMatch(/^DEL-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    }
  });

  it('does not collide across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(newDeliveryOrderNumber());
    expect(seen.size).toBe(20000);
  });

  it('accepts a prefix', () => {
    expect(newDeliveryOrderNumber('TRK')).toMatch(/^TRK-/);
  });
});
