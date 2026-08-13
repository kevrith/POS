import {
  mapExpense, mapLeave, mapAdvance, mapPurchaseOrder,
  leaveDays, poTotalCents, sortApprovals, countByKind, daysWaiting,
  decisionBody, APPROVAL_ENDPOINTS,
  type ApprovalItem,
} from '../lib/approvals';

const nameOf = (id: string | null | undefined) =>
  id === 'u1' ? 'Grace' : id === 'u2' ? 'Otieno' : undefined;

describe('mapExpense', () => {
  it('resolves the submitter id to a name', () => {
    const item = mapExpense(
      { id: 'e1', amountCents: 25_000, category: 'Transport', description: 'Boda to Westlands', submittedBy: 'u1', createdAt: '2026-08-10T09:00:00Z' },
      nameOf,
    );
    expect(item).toMatchObject({ kind: 'expense', who: 'Grace', amountCents: 25_000, title: 'Transport' });
  });

  it('falls back to Unknown when the submitter is not on the roster', () => {
    const item = mapExpense(
      { id: 'e2', amountCents: 100, category: 'Other', description: 'x', submittedBy: 'ghost', createdAt: '2026-08-10T09:00:00Z' },
      nameOf,
    );
    expect(item.who).toBe('Unknown');
  });
});

describe('leaveDays', () => {
  // A one-day request has the same start and end date; counting the difference
  // alone would report zero days off.
  it('counts both ends inclusively', () => {
    expect(leaveDays('2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z')).toBe(1);
    expect(leaveDays('2026-08-10T00:00:00Z', '2026-08-14T00:00:00Z')).toBe(5);
  });

  it('returns 0 for a reversed or unparseable range', () => {
    expect(leaveDays('2026-08-14T00:00:00Z', '2026-08-10T00:00:00Z')).toBe(0);
    expect(leaveDays('nonsense', 'also nonsense')).toBe(0);
  });
});

describe('mapLeave', () => {
  it('pluralises the day count and reads the nested employee name', () => {
    const item = mapLeave({
      id: 'l1', type: 'ANNUAL', startDate: '2026-08-10T00:00:00Z', endDate: '2026-08-12T00:00:00Z',
      reason: 'Family', createdAt: '2026-08-01T08:00:00Z',
      employee: { user: { name: 'Otieno' } },
    });
    expect(item.title).toBe('ANNUAL leave · 3 days');
    expect(item.who).toBe('Otieno');
    expect(item.subtitle).toBe('Family');
  });

  it('says one day (singular) for a single-day request', () => {
    const item = mapLeave({
      id: 'l2', type: 'SICK', startDate: '2026-08-10T00:00:00Z', endDate: '2026-08-10T00:00:00Z',
      createdAt: '2026-08-01T08:00:00Z', employee: { user: { name: 'A' } },
    });
    expect(item.title).toContain('1 day');
    expect(item.title).not.toContain('1 days');
  });

  it('substitutes a placeholder when no reason was given', () => {
    const item = mapLeave({
      id: 'l3', type: 'SICK', startDate: '2026-08-10T00:00:00Z', endDate: '2026-08-10T00:00:00Z',
      reason: '   ', createdAt: '2026-08-01T08:00:00Z', employee: null,
    });
    expect(item.subtitle).toBe('No reason given');
    expect(item.who).toBe('Unknown');
  });
});

describe('mapAdvance', () => {
  it('carries the amount and requester', () => {
    const item = mapAdvance({
      id: 'a1', amountCents: 500_000, reason: 'School fees', requestedAt: '2026-08-05T10:00:00Z',
      employee: { user: { name: 'Grace' } },
    });
    expect(item).toMatchObject({ kind: 'advance', amountCents: 500_000, who: 'Grace' });
  });
});

describe('purchase orders', () => {
  it('derives the total from the lines, since the model stores none', () => {
    expect(poTotalCents({
      id: 'p1', poNumber: 'PO-1', createdAt: '2026-08-01T00:00:00Z',
      items: [
        { quantityOrdered: 3, agreedPriceCents: 1_000 },
        { quantityOrdered: 2, agreedPriceCents: 2_500 },
      ],
    })).toBe(8_000);
  });

  it('totals zero when a PO has no lines', () => {
    expect(poTotalCents({ id: 'p2', poNumber: 'PO-2', createdAt: '2026-08-01T00:00:00Z' })).toBe(0);
  });

  it('titles the item with the PO number and names the supplier', () => {
    const item = mapPurchaseOrder({
      id: 'p3', poNumber: 'PO-0007', createdAt: '2026-08-01T00:00:00Z',
      supplier: { name: 'Bidco' }, items: [{ quantityOrdered: 1, agreedPriceCents: 5_000 }],
    });
    expect(item.title).toBe('PO PO-0007');
    expect(item.subtitle).toBe('Bidco');
    expect(item.amountCents).toBe(5_000);
  });
});

describe('sortApprovals', () => {
  const mk = (id: string, whenISO: string): ApprovalItem =>
    ({ kind: 'expense', id, title: id, subtitle: '', who: 'x', whenISO });

  // Every source endpoint returns newest-first; a manager's queue is the
  // opposite — whatever has blocked someone longest goes on top.
  it('puts the oldest request first', () => {
    const sorted = sortApprovals([
      mk('new', '2026-08-12T00:00:00Z'),
      mk('old', '2026-08-01T00:00:00Z'),
      mk('mid', '2026-08-06T00:00:00Z'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['old', 'mid', 'new']);
  });

  it('sinks unparseable dates instead of scrambling the order', () => {
    const sorted = sortApprovals([mk('bad', 'not-a-date'), mk('good', '2026-08-01T00:00:00Z')]);
    expect(sorted[0].id).toBe('good');
  });

  it('does not mutate the input array', () => {
    const input = [mk('b', '2026-08-12T00:00:00Z'), mk('a', '2026-08-01T00:00:00Z')];
    sortApprovals(input);
    expect(input[0].id).toBe('b');
  });
});

describe('countByKind', () => {
  it('reports zero for kinds with nothing pending', () => {
    const counts = countByKind([
      { kind: 'expense', id: '1', title: '', subtitle: '', who: '', whenISO: '' },
      { kind: 'expense', id: '2', title: '', subtitle: '', who: '', whenISO: '' },
      { kind: 'leave', id: '3', title: '', subtitle: '', who: '', whenISO: '' },
    ]);
    expect(counts).toEqual({ expense: 2, leave: 1, advance: 0, po: 0 });
  });
});

describe('daysWaiting', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('counts whole days since the request', () => {
    expect(daysWaiting('2026-08-13T09:00:00Z', now)).toBe(0);
    expect(daysWaiting('2026-08-10T09:00:00Z', now)).toBe(3);
  });

  it('never goes negative for a future-dated row', () => {
    expect(daysWaiting('2026-09-01T00:00:00Z', now)).toBe(0);
  });
});

describe('decisionBody', () => {
  // Each endpoint wants a different payload; sending `approvedBy` to a rejected
  // advance would record the rejecter as the approver.
  it('uses approvedBy for expenses and leave, either way', () => {
    expect(decisionBody('expense', true, 'u1')).toEqual({ approvedBy: 'u1' });
    expect(decisionBody('expense', false, 'u1')).toEqual({ approvedBy: 'u1' });
    expect(decisionBody('leave', false, 'u1')).toEqual({ approvedBy: 'u1' });
  });

  it('switches an advance to rejectedBy on a reject', () => {
    expect(decisionBody('advance', true, 'u1')).toEqual({ approvedBy: 'u1' });
    expect(decisionBody('advance', false, 'u1')).toEqual({ rejectedBy: 'u1' });
  });

  it('sends a target status for a purchase order, not a user id', () => {
    expect(decisionBody('po', true, 'u1')).toEqual({ status: 'APPROVED' });
    expect(decisionBody('po', false, 'u1')).toEqual({ status: 'CANCELLED' });
  });
});

describe('APPROVAL_ENDPOINTS', () => {
  it('routes each kind to its own controller', () => {
    expect(APPROVAL_ENDPOINTS.expense.approve('x')).toBe('/expenses/x/approve');
    expect(APPROVAL_ENDPOINTS.leave.reject('x')).toBe('/hr/leave/x/reject');
    expect(APPROVAL_ENDPOINTS.advance.approve('x')).toBe('/hr/salary-advances/x/approve');
  });

  it('points both PO decisions at the same status endpoint', () => {
    expect(APPROVAL_ENDPOINTS.po.approve('x')).toBe(APPROVAL_ENDPOINTS.po.reject('x'));
  });
});
