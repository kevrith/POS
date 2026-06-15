import { parseOrderItems, matchOrderToMenu, MenuItemLite } from '../lib/reorder';

describe('parseOrderItems', () => {
  it('parses a DELIVERY order notes string', () => {
    expect(parseOrderItems('DELIVERY: 2x Pizza, 1x Coke')).toEqual([
      { quantity: 2, name: 'Pizza' },
      { quantity: 1, name: 'Coke' },
    ]);
  });

  it('parses PICKUP and strips a trailing custom note from the last item', () => {
    expect(parseOrderItems('PICKUP: 1x Burger, 3x Fries. No onions please')).toEqual([
      { quantity: 1, name: 'Burger' },
      { quantity: 3, name: 'Fries' },
    ]);
  });

  it('is null-safe and ignores malformed segments', () => {
    expect(parseOrderItems(undefined)).toEqual([]);
    expect(parseOrderItems('')).toEqual([]);
    expect(parseOrderItems('DELIVERY: just chatting')).toEqual([]);
  });

  it('handles multi-word item names', () => {
    expect(parseOrderItems('DELIVERY: 2x Chicken Tikka Masala')).toEqual([
      { quantity: 2, name: 'Chicken Tikka Masala' },
    ]);
  });
});

describe('matchOrderToMenu', () => {
  const menu: MenuItemLite[] = [
    { id: 'p1', name: 'Pizza', retailPriceCents: 90000 },
    { id: 'c1', name: 'Coke', retailPriceCents: 15000 },
  ];

  it('matches by name case-insensitively and carries quantity + current price', () => {
    const { matched, missing } = matchOrderToMenu(
      [{ quantity: 2, name: 'pizza' }, { quantity: 1, name: 'COKE' }],
      menu,
    );
    expect(matched).toEqual([
      { id: 'p1', name: 'Pizza', retailPriceCents: 90000, quantity: 2 },
      { id: 'c1', name: 'Coke', retailPriceCents: 15000, quantity: 1 },
    ]);
    expect(missing).toEqual([]);
  });

  it('reports items no longer on the menu', () => {
    const { matched, missing } = matchOrderToMenu(
      [{ quantity: 1, name: 'Pizza' }, { quantity: 2, name: 'Discontinued Special' }],
      menu,
    );
    expect(matched.map((m) => m.id)).toEqual(['p1']);
    expect(missing).toEqual(['Discontinued Special']);
  });
});
