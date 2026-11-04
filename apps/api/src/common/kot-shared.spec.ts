import {
  inferStation, stationForItem, normalizeStation, canTransitionKot, isKotStatus,
  parseEnabledModules, hasRestaurantAccess, hasHotelAccess, moduleIncludedByMode, KOT_STATION_PRINTER_HANDLE,
} from '@pos/shared';

describe('inferStation', () => {
  it.each([
    ['Coke 500ml', 'BAR'],
    ['Tusker Lager', 'BAR'],
    ['Pilsner', 'BAR'],
    ['Fanta Orange', 'BAR'],
    ['Gin and Tonic', 'BAR'],
    ['Cappuccino', 'BAR'],
    ['Cheesecake', 'DESSERT'],
    ['Ice Cream', 'DESSERT'],
    ['Nyama Choma', 'KITCHEN'],
    ['Pilau', 'KITCHEN'],
    ['Chips', 'KITCHEN'],
  ])('puts %s at %s', (name, station) => {
    expect(inferStation(name)).toBe(station);
  });

  it('does not mistake a word that merely contains a drink word', () => {
    expect(inferStation('Beef Steak')).toBe('KITCHEN'); // "tea" inside "steak"
    expect(inferStation('Ginger Chicken')).toBe('KITCHEN'); // "gin" inside "ginger"
  });

  it('trusts the category over an unfamiliar name', () => {
    expect(inferStation('House Special', 'Beverages')).toBe('BAR');
    expect(inferStation('House Special', 'Desserts')).toBe('DESSERT');
  });

  it('sends anything unrecognised to the kitchen, where a stray ticket is noticed', () => {
    expect(inferStation('Mystery item')).toBe('KITCHEN');
  });
});

describe('stationForItem', () => {
  it('an explicit station beats the guess', () => {
    expect(stationForItem({ name: 'Coke', station: 'KITCHEN' })).toBe('KITCHEN');
    expect(stationForItem({ name: 'Coke', station: 'bar' })).toBe('BAR');
  });

  it('falls back to the guess for an empty or unknown station', () => {
    expect(stationForItem({ name: 'Coke', station: '' })).toBe('BAR');
    expect(stationForItem({ name: 'Coke', station: 'GALLEY' })).toBe('BAR');
    expect(normalizeStation('GALLEY')).toBeNull();
  });

  it('every station has a printer handle', () => {
    expect(KOT_STATION_PRINTER_HANDLE).toEqual({ KITCHEN: 'KOT_FOOD', BAR: 'KOT_DRINKS', DESSERT: 'KOT_DESSERTS' });
  });
});

describe('ticket status transitions', () => {
  it('walks the normal path', () => {
    expect(canTransitionKot('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionKot('IN_PROGRESS', 'READY')).toBe(true);
    expect(canTransitionKot('READY', 'SERVED')).toBe(true);
  });

  it('allows a recall and a one-tap ready, but never a step backwards past that', () => {
    expect(canTransitionKot('READY', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionKot('PENDING', 'READY')).toBe(true);
    expect(canTransitionKot('IN_PROGRESS', 'PENDING')).toBe(false);
    expect(canTransitionKot('READY', 'PENDING')).toBe(false);
  });

  it('treats served and cancelled as final', () => {
    for (const to of ['PENDING', 'IN_PROGRESS', 'READY', 'SERVED', 'CANCELLED'] as const) {
      expect(canTransitionKot('SERVED', to)).toBe(false);
      expect(canTransitionKot('CANCELLED', to)).toBe(false);
    }
  });

  it('recognises only real statuses', () => {
    expect(isKotStatus('READY')).toBe(true);
    expect(isKotStatus('DONE')).toBe(false);
    expect(isKotStatus(undefined)).toBe(false);
  });
});

describe('restaurant access', () => {
  it('is on for restaurant tills', () => {
    for (const m of ['HOSPITALITY', 'FAST_FOOD', 'BAR_TAB']) expect(hasRestaurantAccess(m, '[]')).toBe(true);
  });

  it('is off for supermarkets, fuel stations and pharmacies unless the module is enabled', () => {
    for (const m of ['SUPERMARKET', 'FUEL_PUMP', 'CLINIC', 'RETAIL']) {
      expect(hasRestaurantAccess(m, '[]')).toBe(false);
      expect(hasRestaurantAccess(m, '["RESTAURANT"]')).toBe(true);
    }
  });

  it('ignores junk in the stored list', () => {
    expect(parseEnabledModules('not json')).toEqual([]);
    expect(parseEnabledModules('["RESTAURANT","PIZZA"]')).toEqual(['RESTAURANT']);
    expect(parseEnabledModules(undefined)).toEqual([]);
  });
});

describe('hotel access', () => {
  it('is on for the hospitality till only, or when the Hotel module is enabled', () => {
    expect(hasHotelAccess('HOSPITALITY', '[]')).toBe(true);
    for (const m of ['FAST_FOOD', 'BAR_TAB', 'RETAIL', 'SUPERMARKET', 'FUEL_PUMP', 'CLINIC']) {
      expect(hasHotelAccess(m, '[]')).toBe(false);
      expect(hasHotelAccess(m, '["HOTEL"]')).toBe(true);
    }
  });

  it('keeps the two modules independent', () => {
    expect(hasRestaurantAccess('RETAIL', '["HOTEL"]')).toBe(false);
    expect(hasHotelAccess('RETAIL', '["RESTAURANT"]')).toBe(false);
  });

  it('knows which modules a till already includes', () => {
    expect(moduleIncludedByMode('RESTAURANT', 'FAST_FOOD')).toBe(true);
    expect(moduleIncludedByMode('HOTEL', 'FAST_FOOD')).toBe(false);
    expect(moduleIncludedByMode('HOTEL', 'HOSPITALITY')).toBe(true);
  });
});
