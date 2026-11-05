import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');

/** The motion rules are easy to break by accident and hard to notice, so the ones that protect people are pinned here. */
describe('motion rules in index.css', () => {
  it('turns animation and transitions off for people who ask their system for reduced motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(block).toContain('animation-duration: 0.01ms');
    expect(block).toContain('transition-duration: 0.01ms');
    expect(block).toContain('.surface-interactive:hover');
  });

  it('keeps loading spinners spinning under reduced motion (a stopped loader looks like a frozen page)', () => {
    expect(css).toMatch(/\*:not\(\.animate-spin\)/);
  });

  it('only lifts a card on hover where there is a real pointer, so a tap does not leave it stuck up', () => {
    const idx = css.indexOf('@media (hover: hover) and (pointer: fine)');
    expect(idx).toBeGreaterThan(-1);
    expect(css.slice(idx, idx + 400)).toContain('.surface-interactive:hover');
    // the lift itself must not exist outside that media query
    const outside = css.replace(/@media \(hover: hover\) and \(pointer: fine\)\s*\{[\s\S]*?\n\}\n/, '');
    expect(outside).not.toMatch(/\.surface-interactive:hover[^{]*\{[^}]*translateY\(-2px\)/);
  });

  it('a pressed or disabled card does not hover', () => {
    expect(css).toContain(":hover:not(:disabled):not([aria-disabled='true'])");
  });

  it('every interactive card has a visible keyboard focus ring', () => {
    expect(css).toMatch(/\.surface-interactive:focus-visible[^{]*\{[^}]*outline:/);
    expect(css).toMatch(/\.lift:focus-visible[^{]*\{[^}]*outline:/);
  });

  it('entrance animations release the element afterwards (fill-mode forwards or both would freeze the hover lift)', () => {
    expect(css).toMatch(/\.stagger > \*\s*\{[^}]*animation: rise [^;]*backwards;/);
    expect(css).not.toMatch(/animation: (rise|fill-x)[^;]*\bboth\b/);
  });

  it('a staggered group covers at least eight items and has a cap for the rest', () => {
    expect(css).toContain('.stagger > *:nth-child(8)');
    expect(css).toContain('.stagger > *:nth-child(n+9)');
  });

  describe('sidebar', () => {
    it('marks the current page with aria-current and fills its accent bar', () => {
      expect(css).toMatch(/\.nav-item\[aria-current='page'\]::before\s*\{[^}]*scaleY\(1\)/);
    });

    it('only grows the bar, pops the icon and nudges the label under a real pointer', () => {
      const idx = css.indexOf('@media (hover: hover) and (pointer: fine)', css.indexOf('.nav-item'));
      expect(idx).toBeGreaterThan(-1);
      const block = css.slice(idx, idx + 1200);
      expect(block).toContain('.nav-item:hover::before');
      expect(block).toContain('.nav-item:hover .nav-label');
      expect(block).toContain('scale(1.12)');
      // and none of those exist outside it
      const outside = css.slice(0, idx);
      expect(outside).not.toMatch(/\.nav-item:hover[^{]*\{[^}]*(translateX|scale\(1\.12\))/);
    });

    it('shows a focus indicator for the keyboard and a press state', () => {
      expect(css).toMatch(/\.nav-item:focus-visible\s*\{[^}]*outline:/);
      expect(css).toMatch(/\.nav-item:active\s*\{[^}]*scale\(0\.98\)/);
    });

    it('rotates the group chevron instead of swapping icons', () => {
      expect(css).toContain("[aria-expanded='false'] > .nav-chevron");
    });
  });
});
