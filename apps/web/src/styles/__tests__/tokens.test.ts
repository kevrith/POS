import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../../..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('generated files are in step with design/tokens.json (run `npm run tokens` if this fails)', () => {
    expect(() => execFileSync('node', ['design/build-tokens.mjs', '--check'], { cwd: root, stdio: 'pipe' })).not.toThrow();
  });

  it('the brand is Signal Violet and the page is Mist Gray', () => {
    expect(tokens.brand['600'].toUpperCase()).toBe('#7A35FF');
    expect(tokens.neutral['100'].toUpperCase()).toBe('#F0F2F5');
  });

  const AA = 4.5;
  describe('text contrast (WCAG AA, 4.5:1) for the pairings the UI uses', () => {
    const cases: Array<[string, string, string]> = [
      ['white on the primary button', '#FFFFFF', tokens.brand['600']],
      ['white on the primary button hover', '#FFFFFF', tokens.brand['700']],
      ['primary text on a white card', tokens.brand['600'], '#FFFFFF'],
      ['primary text on the Mist Gray page', tokens.brand['600'], tokens.neutral['100']],
      ['body text (gray-900) on the page', tokens.neutral['900'], tokens.neutral['100']],
      ['secondary text (gray-600) on the page', tokens.neutral['600'], tokens.neutral['100']],
      ['muted text (gray-500) on a white card', tokens.neutral['500'], '#FFFFFF'],
      ['muted text (gray-500) on the page', tokens.neutral['500'], tokens.neutral['100']],
      ['brand badge text on its tint', tokens.brand['800'], tokens.brand['100']],
      ['success text on white', tokens.status.success, '#FFFFFF'],
      ['danger text on white', tokens.status.danger, '#FFFFFF'],
      ['warning text on white', tokens.status.warning, '#FFFFFF'],
      ['white on a green button (green 600)', '#FFFFFF', tokens.statusShades.green600],
      ['green 600 text on white', tokens.statusShades.green600, '#FFFFFF'],
      ['emerald 600 text on white', tokens.statusShades.emerald600, '#FFFFFF'],
      ['amber 600 text on white', tokens.statusShades.amber600, '#FFFFFF'],
      ['orange 600 text on white', tokens.statusShades.orange600, '#FFFFFF'],
      ['dark: body text on the dark card', tokens.darkText.gray900, tokens.darkSurface.white],
      ['dark: muted text on the dark card', tokens.darkText.gray500, tokens.darkSurface.white],
      ['dark: tertiary text on the dark card', tokens.darkText.gray400, tokens.darkSurface.white],
      ['dark: body text on the dark page', tokens.darkText.gray900, tokens.neutral['950']],
      ['dark: primary text on the dark card', tokens.brand['400'], tokens.darkSurface.white],
    ];
    it.each(cases)('%s', (_name, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
    });
  });
});
