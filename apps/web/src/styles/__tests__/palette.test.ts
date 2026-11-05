import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import colors from 'tailwindcss/colors';
// @ts-expect-error plain JS module shared with tailwind.config.js
import { buildPalette } from '../../../tailwind.palette.js';

const root = path.resolve(__dirname, '../../../../..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const palette = buildPalette(tokens, colors) as { vars: Record<string, Record<string, string>> };

const rgb = (triplet: string) => triplet.split(' ').map(Number);
const lum = ([r, g, b]: number[]) => {
  const [x, y, z] = [r, g, b].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * x + 0.7152 * y + 0.0722 * z;
};
const contrast = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };

const families = [...new Set(Object.keys(palette.vars[':root']).map((k) => k.replace(/^--/, '').split('-')[0]))];
const WHITE = [255, 255, 255];
const DARK_CARD = rgb(`${hexTriplet(tokens.darkSurface.white)}`);
function hexTriplet(h: string) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' '); }

describe('status and brand palettes (generated for Tailwind)', () => {
  it('covers every family the UI uses', () => {
    expect(families.sort()).toEqual(['amber', 'brand', 'emerald', 'green', 'orange', 'pink', 'red', 'rose', 'yellow']);
  });

  describe.each(families)('%s', (fam) => {
    const light = (n: string) => rgb(palette.vars[':root'][`--${fam}-${n}`]);
    const dark = (n: string) => rgb(palette.vars['.dark'][`--${fam}-${n}`]);

    it('light: deep text is readable on white and on its own pale fills', () => {
      expect(contrast(light('tx-600'), WHITE)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light('tx-700'), light('bg-100'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light('tx-800'), light('bg-100'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light('tx-900'), light('bg-200'))).toBeGreaterThanOrEqual(4.5);
    });

    it('dark: light text is readable on the dark card and on the dark tints', () => {
      for (const t of ['tx-600', 'tx-700', 'tx-800', 'tx-900']) {
        expect(contrast(dark(t), DARK_CARD)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(dark('tx-600'), dark('bg-50'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark('tx-700'), dark('bg-100'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark('tx-800'), dark('bg-200'))).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('solid fills that carry white text reach 4.5:1', () => {
    for (const [fam, solid] of Object.entries(tokens.statusSolid)) {
      if (fam === '_comment') continue;
      expect(contrast(rgb(hexTriplet(solid as string)), WHITE), `bg-${fam}-500`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
