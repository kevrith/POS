import { BadRequestException } from '@nestjs/common';
import { computeTaxes, type TaxClass } from '@pos/shared';
import { numberInRange, oneOf, text } from './validate';

/**
 * Levies a hotel adds on top of a stay (a tourism levy, a catering levy). Whether to charge one, at what rate, and
 * on what, differs hotel to hotel, so each business lists its own; most list none.
 *
 * A levy is worked out on the VAT-EXCLUSIVE value of the lines it applies to (the room nights, or everything), and
 * is charged on top of the VAT-inclusive prices as its own invoice line, not subject to VAT. Confirm the base and
 * the rate with your accountant: this is how the system computes what the business has said to charge.
 */
export interface HotelLevy {
  name: string;
  /** Percent of the base, up to two decimals. */
  ratePct: number;
  /** ROOM: the room nights only. ALL: every charge on the stay. */
  base: 'ROOM' | 'ALL';
}

export const MAX_LEVIES = 5;
export const LEVY_BASES = ['ROOM', 'ALL'] as const;

/** What a client sends: strict. */
export function validateLevies(input: unknown): HotelLevy[] {
  const raw = typeof input === 'string' ? safeJson(input) : input;
  if (!Array.isArray(raw)) throw new BadRequestException('hotelLevies must be a list');
  if (raw.length > MAX_LEVIES) throw new BadRequestException(`A hotel can have at most ${MAX_LEVIES} levies`);
  return raw.map((l, i) => {
    const ratePct = numberInRange(l?.ratePct, `Rate of levy ${i + 1}`, { min: 0, max: 30, exclusiveMin: true });
    return {
      name: text(l?.name, `Name of levy ${i + 1}`, 40),
      ratePct: Math.round(ratePct * 100) / 100,
      base: oneOf(l?.base ?? 'ROOM', `Base of levy ${i + 1}`, LEVY_BASES),
    };
  });
}

/** What is stored: tolerant, so a bad value can never stop a guest checking out. */
export function parseStoredLevies(stored: string | null | undefined): HotelLevy[] {
  try {
    return validateLevies(stored ?? '[]');
  } catch {
    return [];
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export interface LevyAmount { name: string; ratePct: number; amountCents: number }

/**
 * The levies on a stay. `lines` are the stay's charges with the class each is taxed under; levies are worked out
 * on the value of the lines they apply to, with VAT taken out.
 */
export function computeLevies(
  levies: HotelLevy[],
  lines: Array<{ totalCents: number; taxClass: TaxClass; isRoom: boolean }>,
  vatRegistered: boolean,
): LevyAmount[] {
  if (levies.length === 0) return [];
  const exVat = (subset: typeof lines) => {
    const t = computeTaxes(subset.map((l) => ({ totalCents: l.totalCents, taxClass: l.taxClass })), 0, { vatRegistered });
    return t.lines.reduce((s, l) => s + (l.netCents - l.vatCents), 0);
  };
  const room = exVat(lines.filter((l) => l.isRoom));
  const all = exVat(lines);
  return levies
    .map((l) => ({ name: l.name, ratePct: l.ratePct, amountCents: Math.round(((l.base === 'ROOM' ? room : all) * l.ratePct) / 100) }))
    .filter((l) => l.amountCents > 0);
}
