import { parseNotificationData, resolveRoute, RouteMap } from '../src/routing';

describe('parseNotificationData', () => {
  it('extracts type and string id', () => {
    expect(parseNotificationData({ type: 'delivery', id: 'd1' })).toEqual({
      type: 'delivery',
      id: 'd1',
      raw: { type: 'delivery', id: 'd1' },
    });
  });

  it('coerces a numeric id to string and reads entityId fallback', () => {
    expect(parseNotificationData({ type: 'order', id: 42 }).id).toBe('42');
    expect(parseNotificationData({ type: 'order', entityId: 'e9' }).id).toBe('e9');
  });

  it('is null-safe for missing / non-object payloads', () => {
    expect(parseNotificationData(undefined)).toEqual({ type: undefined, id: undefined, raw: {} });
    expect(parseNotificationData(null)).toEqual({ type: undefined, id: undefined, raw: {} });
    expect(parseNotificationData('nope')).toEqual({ type: undefined, id: undefined, raw: {} });
  });

  it('ignores non-string type', () => {
    expect(parseNotificationData({ type: 123, id: 'x' }).type).toBeUndefined();
  });
});

describe('resolveRoute', () => {
  const map: RouteMap = {
    delivery: '/delivery/:id',
    order: '/(tabs)/orders',
    collection: '/collections/:id',
  };

  it('substitutes :id for entity routes', () => {
    expect(resolveRoute({ type: 'delivery', id: 'd1', raw: {} }, map)).toBe('/delivery/d1');
  });

  it('returns idless routes as-is', () => {
    expect(resolveRoute({ type: 'order', raw: {} }, map)).toBe('/(tabs)/orders');
  });

  it('returns null when the :id route has no id', () => {
    expect(resolveRoute({ type: 'delivery', raw: {} }, map)).toBeNull();
  });

  it('returns null for unknown or missing types', () => {
    expect(resolveRoute({ type: 'unknown', id: 'x', raw: {} }, map)).toBeNull();
    expect(resolveRoute({ raw: {} }, map)).toBeNull();
  });
});
