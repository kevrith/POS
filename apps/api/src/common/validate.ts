import { BadRequestException } from '@nestjs/common';

/**
 * The API has no global ValidationPipe, so request bodies reach services
 * untyped. These turn a missing or wrongly-shaped field into a 400 instead of a
 * `Cannot read properties of undefined` 500.
 */
export function requireArray<T = unknown>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) throw new BadRequestException(`${field} must be an array`);
  return value as T[];
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

/** A whole number within [min, max]. Strings of digits are accepted: bodies arrive untyped. */
export function intInRange(value: unknown, label: string, min: number, max: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException(`${label} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

/** A finite number within [min, max]; `exclusiveMin` makes the lower bound strict (a quantity must be above zero). */
export function numberInRange(
  value: unknown,
  label: string,
  { min, max, exclusiveMin = false }: { min: number; max: number; exclusiveMin?: boolean },
): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  const belowMin = typeof n === 'number' && (exclusiveMin ? n <= min : n < min);
  if (typeof n !== 'number' || !Number.isFinite(n) || belowMin || n > max) {
    throw new BadRequestException(`${label} must be a number ${exclusiveMin ? 'above' : 'from'} ${min}${exclusiveMin ? ' and' : ' to'} up to ${max}`);
  }
  return n;
}

export function oneOf<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new BadRequestException(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

/** Trimmed, non-empty text of at most `max` characters. */
export function text(value: unknown, label: string, max = 200): string {
  const s = requireString(value, label).trim();
  if (s.length > max) throw new BadRequestException(`${label} must be at most ${max} characters`);
  return s;
}

/** Optional text: undefined/null/'' become undefined, anything else is validated like `text`. */
export function optionalText(value: unknown, label: string, max = 200): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, label, max);
}

/** A KRA PIN is a letter, nine digits and a letter (P051234567Z). Blank means none; anything else is refused. */
export function optionalKraPin(value: unknown, label = 'KRA PIN'): string | undefined {
  const t = optionalText(value, label, 20);
  if (!t) return undefined;
  const pin = t.toUpperCase();
  if (!/^[AP]\d{9}[A-Z]$/.test(pin)) throw new BadRequestException(`A ${label} looks like P051234567Z`);
  return pin;
}
