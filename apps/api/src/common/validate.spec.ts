import { BadRequestException } from '@nestjs/common';
import { intInRange, numberInRange, oneOf, optionalText, text } from './validate';

describe('validate helpers', () => {
  it('intInRange accepts whole numbers and digit strings, rejects the rest', () => {
    expect(intInRange(5, 'n', 1, 10)).toBe(5);
    expect(intInRange('7', 'n', 1, 10)).toBe(7);
    for (const bad of [0, 11, 1.5, -3, NaN, Infinity, '', ' ', 'x', null, undefined, true, {}]) {
      expect(() => intInRange(bad, 'n', 1, 10)).toThrow(BadRequestException);
    }
  });

  it('numberInRange keeps a quantity above zero and finite', () => {
    expect(numberInRange(0.5, 'L', { min: 0, max: 100, exclusiveMin: true })).toBe(0.5);
    expect(numberInRange('12.25', 'L', { min: 0, max: 100, exclusiveMin: true })).toBe(12.25);
    for (const bad of [0, -1, -0.001, 100.01, NaN, Infinity, 'abc', '', null, undefined]) {
      expect(() => numberInRange(bad, 'L', { min: 0, max: 100, exclusiveMin: true })).toThrow(BadRequestException);
    }
    expect(numberInRange(0, 'L', { min: 0, max: 100 })).toBe(0);
  });

  it('oneOf only lets listed values through', () => {
    expect(oneOf('CASH', 'method', ['CASH', 'CARD'] as const)).toBe('CASH');
    expect(() => oneOf('cash', 'method', ['CASH'] as const)).toThrow(BadRequestException);
    expect(() => oneOf(undefined, 'method', ['CASH'] as const)).toThrow(BadRequestException);
  });

  it('text trims and bounds, optionalText tolerates absence', () => {
    expect(text('  hi ', 'f')).toBe('hi');
    expect(() => text('x'.repeat(201), 'f')).toThrow(BadRequestException);
    expect(() => text('   ', 'f')).toThrow(BadRequestException);
    expect(optionalText(undefined, 'f')).toBeUndefined();
    expect(optionalText('', 'f')).toBeUndefined();
    expect(optionalText(' ok ', 'f')).toBe('ok');
  });
});
