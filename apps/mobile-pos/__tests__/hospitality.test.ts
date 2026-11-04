import {
  normalizeTableStatus, tableAction, sortFloor, summariseFloor,
  orderTotalCents, unsentLines, minutesSince, ticketAge, buildAddItemsPayload,
  modifierNames, ticketLocation, ticketsForStation, ticketActions,
  TABLE_STATUS_LABELS,
  type FloorTable, type OrderLine, type KdsTicket,
} from '../lib/hospitality';

const table = (over: Partial<FloorTable> = {}): FloorTable => ({
  id: 't1', number: '1', capacity: 4, status: 'AVAILABLE',
  currentOrderId: null, hasReadyKOT: false, hasPendingKOT: false, activeKOTCount: 0,
  ...over,
});

const line = (over: Partial<OrderLine> = {}): OrderLine => ({
  id: 'l1', itemId: 'i1', name: 'Ugali', quantity: 1,
  unitPriceCents: 20_000, totalCents: 20_000, ...over,
});

describe('normalizeTableStatus', () => {
  it('accepts the four real statuses', () => {
    expect(normalizeTableStatus('OCCUPIED')).toBe('OCCUPIED');
    expect(normalizeTableStatus('BILL_REQUESTED')).toBe('BILL_REQUESTED');
    expect(normalizeTableStatus('RESERVED')).toBe('RESERVED');
    expect(normalizeTableStatus('AVAILABLE')).toBe('AVAILABLE');
  });

  it('treats anything unrecognised as free', () => {
    expect(normalizeTableStatus('WEIRD')).toBe('AVAILABLE');
    expect(normalizeTableStatus(null)).toBe('AVAILABLE');
  });

  it('labels every status for the floor tiles', () => {
    for (const st of Object.keys(TABLE_STATUS_LABELS) as Array<keyof typeof TABLE_STATUS_LABELS>) {
      expect(TABLE_STATUS_LABELS[st].length).toBeGreaterThan(0);
    }
  });
});

describe('tableAction', () => {
  it('opens the existing order when the table has one', () => {
    expect(tableAction(table({ currentOrderId: 'o1', status: 'OCCUPIED' }))).toBe('open');
  });

  it('starts a new order on a free table', () => {
    expect(tableAction(table())).toBe('start');
  });

  // A table can read OCCUPIED after its order was cancelled elsewhere; trusting
  // the label would try to open an order that no longer exists.
  it('follows currentOrderId rather than the status label', () => {
    expect(tableAction(table({ status: 'OCCUPIED', currentOrderId: null }))).toBe('start');
  });
});

describe('sortFloor', () => {
  it('puts food-ready first, then bill-requested, then seated, then free', () => {
    const sorted = sortFloor([
      table({ id: 'free', number: '4' }),
      table({ id: 'seated', number: '3', status: 'OCCUPIED', currentOrderId: 'o' }),
      table({ id: 'bill', number: '2', status: 'BILL_REQUESTED', currentOrderId: 'o' }),
      table({ id: 'ready', number: '1', status: 'OCCUPIED', currentOrderId: 'o', hasReadyKOT: true }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['ready', 'bill', 'seated', 'free']);
  });

  // Table numbers are strings, so a plain sort puts "12" before "2".
  it('orders numeric table names numerically', () => {
    const sorted = sortFloor([table({ id: 'a', number: '12' }), table({ id: 'b', number: '2' })]);
    expect(sorted.map((t) => t.number)).toEqual(['2', '12']);
  });

  it('falls back to alphabetical for non-numeric names', () => {
    const sorted = sortFloor([table({ id: 'a', number: 'B2' }), table({ id: 'b', number: 'A3' })]);
    expect(sorted.map((t) => t.number)).toEqual(['A3', 'B2']);
  });

  it('does not mutate the input', () => {
    const input = [table({ id: 'a', number: '9' }), table({ id: 'b', number: '1' })];
    sortFloor(input);
    expect(input[0].number).toBe('9');
  });
});

describe('summariseFloor', () => {
  it('counts each state, and food-ready independently of status', () => {
    const summary = summariseFloor([
      table(),
      table({ status: 'OCCUPIED', hasReadyKOT: true }),
      table({ status: 'BILL_REQUESTED' }),
    ]);
    expect(summary).toEqual({ total: 3, free: 1, seated: 1, billRequested: 1, foodReady: 1 });
  });

  it('handles an empty floor', () => {
    expect(summariseFloor([])).toEqual({ total: 0, free: 0, seated: 0, billRequested: 0, foodReady: 0 });
  });
});

describe('orderTotalCents', () => {
  it('sums the line totals', () => {
    expect(orderTotalCents([line({ totalCents: 20_000 }), line({ id: 'l2', totalCents: 5_500 })])).toBe(25_500);
  });

  it('is zero for an empty bill', () => {
    expect(orderTotalCents([])).toBe(0);
  });
});

describe('unsentLines', () => {
  // sentToKitchenAt is stamped by the server when a line goes onto a ticket;
  // sending it again would cook it twice.
  it('returns only lines never sent to the kitchen', () => {
    const lines = [
      line({ id: 'sent', sentToKitchenAt: '2026-08-13T10:00:00Z' }),
      line({ id: 'new' }),
      line({ id: 'also-new', sentToKitchenAt: null }),
    ];
    expect(unsentLines(lines).map((l) => l.id)).toEqual(['new', 'also-new']);
  });

  it('returns nothing once the whole order is sent', () => {
    expect(unsentLines([line({ sentToKitchenAt: '2026-08-13T10:00:00Z' })])).toHaveLength(0);
  });

  it('does not treat a fired course as sent (firedAt is the course marker, not the ticket)', () => {
    expect(unsentLines([line({ firedAt: '2026-08-13T10:00:00Z' })])).toHaveLength(1);
  });
});

const ticket = (over: Partial<KdsTicket> = {}): KdsTicket => ({
  id: 'k1', kotNumber: 7, type: 'NEW_ORDER', station: 'KITCHEN', status: 'PENDING',
  createdAt: '2026-08-13T10:00:00Z', order: { id: 'o1', table: { number: '5' }, items: [] },
  ...over,
});

describe('kitchen ticket helpers', () => {
  it('reads modifiers whether stored as names or priced objects', () => {
    expect(modifierNames(JSON.stringify(['No onion', { name: 'Extra cheese', priceCents: 5000 }]))).toEqual(['No onion', 'Extra cheese']);
    expect(modifierNames(null)).toEqual([]);
    expect(modifierNames('not json')).toEqual([]);
  });

  it('names where a ticket is going', () => {
    expect(ticketLocation(ticket())).toBe('Table 5');
    expect(ticketLocation(ticket({ order: { id: 'o', roomNumber: '204', items: [] } }))).toBe('Room 204');
    expect(ticketLocation(ticket({ order: { id: 'o', items: [] } }))).toBe('Takeaway');
  });

  it('filters tickets to one station, or shows all', () => {
    const list = [ticket({ id: 'a' }), ticket({ id: 'b', station: 'BAR' })];
    expect(ticketsForStation(list, 'BAR').map((t) => t.id)).toEqual(['b']);
    expect(ticketsForStation(list, 'ALL')).toHaveLength(2);
  });
});

describe('ticketActions', () => {
  it('starts a kitchen ticket, then marks it ready', () => {
    expect(ticketActions(ticket({ status: 'PENDING' }), 'KITCHEN').map((a) => a.to)).toEqual(['IN_PROGRESS']);
    expect(ticketActions(ticket({ status: 'IN_PROGRESS' }), 'KITCHEN').map((a) => a.to)).toEqual(['READY']);
  });

  it('lets a bar ticket go straight to ready, since a drink needs no cooking', () => {
    expect(ticketActions(ticket({ status: 'PENDING', station: 'BAR' }), 'KITCHEN').map((a) => a.to)).toEqual(['READY']);
  });

  it('offers recall to everyone but served only to non-kitchen roles', () => {
    expect(ticketActions(ticket({ status: 'READY' }), 'KITCHEN').map((a) => a.to)).toEqual(['IN_PROGRESS']);
    expect(ticketActions(ticket({ status: 'READY' }), 'WAITER').map((a) => a.to)).toEqual(['IN_PROGRESS', 'SERVED']);
  });

  it('offers nothing once served or cancelled', () => {
    expect(ticketActions(ticket({ status: 'SERVED' }), 'WAITER')).toEqual([]);
    expect(ticketActions(ticket({ status: 'CANCELLED' }), 'WAITER')).toEqual([]);
  });
});

describe('kitchen ticket ageing', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('counts whole minutes since the ticket opened', () => {
    expect(minutesSince('2026-08-13T11:45:00Z', now)).toBe(15);
    expect(minutesSince('2026-08-13T12:00:00Z', now)).toBe(0);
  });

  it('never goes negative, and survives a bad timestamp', () => {
    expect(minutesSince('2026-08-13T12:30:00Z', now)).toBe(0);
    expect(minutesSince('nonsense', now)).toBe(0);
  });

  it('bands tickets at the 10 and 20 minute marks', () => {
    expect(ticketAge(0)).toBe('fresh');
    expect(ticketAge(9)).toBe('fresh');
    expect(ticketAge(10)).toBe('warm');
    expect(ticketAge(19)).toBe('warm');
    expect(ticketAge(20)).toBe('late');
    expect(ticketAge(120)).toBe('late');
  });
});

describe('buildAddItemsPayload', () => {
  it('drops zero-quantity picks', () => {
    const payload = buildAddItemsPayload([
      { itemId: 'a', name: 'Chai', quantity: 2, unitPriceCents: 5_000 },
      { itemId: 'b', name: 'Mandazi', quantity: 0, unitPriceCents: 2_000 },
    ]);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ itemId: 'a', quantity: 2 });
  });

  it('includes a note only when one was typed', () => {
    const [withNote, withoutNote] = buildAddItemsPayload([
      { itemId: 'a', name: 'Nyama', quantity: 1, unitPriceCents: 5_000, note: '  no chilli ' },
      { itemId: 'b', name: 'Chips', quantity: 1, unitPriceCents: 3_000, note: '   ' },
    ]);
    expect(withNote.specialInstructions).toBe('no chilli');
    expect(withoutNote).not.toHaveProperty('specialInstructions');
  });
});
