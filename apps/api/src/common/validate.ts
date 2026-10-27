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
