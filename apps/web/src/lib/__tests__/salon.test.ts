import { describe, expect, it } from 'vitest';
import {
  appointmentBlocks, billTotals, boardColumns, boardRange, clock, hoursLabel, nairobiMinuteOfDay, overlappingKeys, visitMinutes, visitPriceCents,
  type Appointment, type Stylist,
} from '../salon';

const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00+03:00`).toISOString();
const appt = (o: Partial<Appointment> = {}): Appointment => ({ id: 'a1', customerName: 'Ann', scheduledAt: at('10:00'), duration: 60, status: 'BOOKED', depositCents: 0, ...o });
const stylist = (userId: string, name: string, active = true): Stylist => ({ userId, name, role: 'CASHIER', active, workingHours: {} });

describe('time helpers', () => {
  it('reads the Nairobi clock, not UTC', () => {
    expect(nairobiMinuteOfDay(at('09:30'))).toBe(570);
    expect(nairobiMinuteOfDay('2026-11-10T21:30:00Z')).toBe(30); // 00:30 Nairobi
  });

  it('formats minutes of the day', () => {
    expect(clock(540)).toBe('09:00');
    expect(clock(0)).toBe('00:00');
    expect(clock(1439)).toBe('23:59');
  });

  it('adds up a visit', () => {
    expect(visitMinutes([{ durationMin: 45 }, { durationMin: 90 }])).toBe(135);
    expect(visitPriceCents([{ unitPriceCents: 100 }, { unitPriceCents: 250 }])).toBe(350);
  });
});

describe('hoursLabel', () => {
  it('groups days that run on with the same hours', () => {
    expect(hoursLabel({ '1': ['09:00', '18:00'], '2': ['09:00', '18:00'], '3': ['09:00', '18:00'], '6': ['10:00', '16:00'] })).toBe('Mon-Wed 09:00-18:00, Sat 10:00-16:00');
    expect(hoursLabel({ '1': ['09:00', '18:00'], '3': ['09:00', '18:00'] })).toBe('Mon 09:00-18:00, Wed 09:00-18:00');
  });

  it('says "Any time" with no hours set', () => {
    expect(hoursLabel({})).toBe('Any time');
  });
});

describe('billTotals', () => {
  it('works out the balance after the deposit, and what is paid back when the deposit is bigger', () => {
    expect(billTotals([{ quantity: 1, unitPriceCents: 100_000 }, { quantity: 2, unitPriceCents: 80_000 }], 50_000)).toEqual({ priceCents: 260_000, appliedCents: 50_000, dueCents: 210_000, surplusCents: 0 });
    expect(billTotals([{ quantity: 1, unitPriceCents: 100_000 }], 150_000)).toEqual({ priceCents: 100_000, appliedCents: 100_000, dueCents: 0, surplusCents: 50_000 });
    expect(billTotals([], 0)).toEqual({ priceCents: 0, appliedCents: 0, dueCents: 0, surplusCents: 0 });
  });
});

describe('the day board', () => {
  it('lays a visit with several services out one after another, each in its own stylist\'s column', () => {
    const visit = appt({ scheduledAt: at('10:00'), services: [
      { name: 'Cut', unitPriceCents: 1, durationMin: 45, staffId: 's1', position: 0 },
      { name: 'Colour', unitPriceCents: 1, durationMin: 90, staffId: 's2', position: 1 },
    ] });
    expect(appointmentBlocks(visit)).toEqual([
      { staffId: 's1', label: 'Cut', startMin: 600, endMin: 645 },
      { staffId: 's2', label: 'Colour', startMin: 645, endMin: 735 },
    ]);
    const cols = boardColumns([visit], [stylist('s1', 'Amina'), stylist('s2', 'Brian')]);
    expect(cols.map((c) => [c.name, c.blocks.map((b) => b.label)])).toEqual([['Amina', ['Cut']], ['Brian', ['Colour']]]);
  });

  it('shows an older appointment as one block under its own stylist, and one with nobody under "Unassigned"', () => {
    const cols = boardColumns(
      [appt({ id: 'a1', staffId: 's1' }), appt({ id: 'a2', customerName: 'Walk-in', staffId: null, scheduledAt: at('11:00') })],
      [stylist('s1', 'Amina')],
    );
    expect(cols.map((c) => c.name)).toEqual(['Amina', 'Unassigned']);
    expect(cols[1].blocks[0].label).toBe('Walk-in');
  });

  it('leaves out cancelled and no-show appointments and stylists who are switched off', () => {
    const cols = boardColumns(
      [appt({ id: 'a1', staffId: 's1', status: 'CANCELLED' }), appt({ id: 'a2', staffId: 's1', status: 'NO_SHOW' }), appt({ id: 'a3', staffId: 's1', status: 'CONFIRMED' })],
      [stylist('s1', 'Amina'), stylist('s2', 'Gone', false)],
    );
    expect(cols.map((c) => c.name)).toEqual(['Amina']);
    expect(cols[0].blocks).toHaveLength(1);
  });

  it('sorts a column by start time', () => {
    const cols = boardColumns([appt({ id: 'late', staffId: 's1', scheduledAt: at('15:00') }), appt({ id: 'early', staffId: 's1', scheduledAt: at('09:00') })], [stylist('s1', 'Amina')]);
    expect(cols[0].blocks.map((b) => b.appointment.id)).toEqual(['early', 'late']);
  });

  it('shows 8:00-20:00 and widens to take in an early or late appointment', () => {
    expect(boardRange(boardColumns([appt({ staffId: 's1' })], [stylist('s1', 'A')]))).toEqual({ fromMin: 480, toMin: 1200 });
    const wide = boardRange(boardColumns([appt({ id: 'e', staffId: 's1', scheduledAt: at('06:30'), duration: 30 }), appt({ id: 'l', staffId: 's1', scheduledAt: at('20:30'), duration: 90 })], [stylist('s1', 'A')]));
    expect(wide).toEqual({ fromMin: 360, toMin: 1320 });
  });

  it('flags blocks that overlap in one column (a double booking that older data can hold)', () => {
    const cols = boardColumns([
      appt({ id: 'a', staffId: 's1', scheduledAt: at('10:00'), duration: 60 }),
      appt({ id: 'b', staffId: 's1', scheduledAt: at('10:30'), duration: 30 }),
      appt({ id: 'c', staffId: 's1', scheduledAt: at('12:00'), duration: 30 }),
    ], [stylist('s1', 'A')]);
    const flagged = overlappingKeys(cols[0].blocks);
    expect([...flagged].sort()).toEqual(['a-0', 'b-0']);
  });
});
