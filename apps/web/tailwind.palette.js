/**
 * The status colours (green, amber, red, ...) and the brand families, made to follow the theme.
 *
 * In light mode they are Tailwind's own, with the accessibility shades from design/tokens.json. In dark mode (`.dark`)
 * a pale fill such as `bg-green-50` becomes a dark tint of that colour, text such as `text-green-700` becomes a light
 * shade of it, and a border becomes a soft tint. So a page that was written only for light mode is still readable on
 * a dark surface. An explicit `dark:` class on an element still wins.
 */

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const triplet = (rgb) => rgb.map((n) => Math.round(n)).join(' ');
/** `amount` of colour `a` over colour `b` (hex strings). */
const mix = (a, b, amount) => { const x = hex(a), y = hex(b); return x.map((c, i) => c * amount + y[i] * (1 - amount)); };

export function buildPalette(tokens, colors) {
  // family name -> [palette, utility names that share it]
  const families = {
    brand: [tokens.brand, ['blue', 'indigo', 'purple', 'violet', 'sky', 'cyan', 'brand']],
    green: [{ ...colors.green, 600: tokens.statusShades.green600 }, ['green']],
    emerald: [{ ...colors.emerald, 600: tokens.statusShades.emerald600 }, ['emerald', 'teal']],
    amber: [{ ...colors.amber, 600: tokens.statusShades.amber600 }, ['amber']],
    yellow: [{ ...colors.yellow, 600: tokens.statusShades.yellow600 }, ['yellow']],
    orange: [{ ...colors.orange, 600: tokens.statusShades.orange600 }, ['orange']],
    red: [{ ...colors.red, 600: tokens.statusShades.red600 }, ['red']],
    rose: [colors.rose, ['rose']],
    pink: [colors.pink, ['pink']],
  };
  const card = tokens.darkSurface.white;
  const root = {};
  const dark = {};
  const backgroundColor = {};
  const textColor = {};
  const borderColor = {};
  const ref = (name) => `rgb(var(--${name}) / <alpha-value>)`;

  for (const [fam, [pal, names]] of Object.entries(families)) {
    const lightText = fam === 'brand' ? { 600: tokens.brandText.light, 700: pal[700], 800: pal[800], 900: pal[900] } : { 600: pal[600], 700: pal[700], 800: pal[800], 900: pal[900] };
    const set = (name, light, darkRgb) => { root[`--${fam}-${name}`] = triplet(hex(light)); dark[`--${fam}-${name}`] = triplet(darkRgb); };
    // fills: pale in light mode, a dark tint of the colour in dark mode
    set('bg-50', pal[50], mix(pal[500], card, 0.10));
    set('bg-100', pal[100], mix(pal[500], card, 0.16));
    set('bg-200', pal[200], mix(pal[500], card, 0.24));
    // text: deep in light mode, a light shade of the same colour in dark mode
    set('tx-600', lightText[600], fam === 'brand' ? hex(tokens.brandText.dark) : hex(pal[400]));
    set('tx-700', lightText[700], hex(pal[300]));
    set('tx-800', lightText[800], hex(pal[200]));
    set('tx-900', lightText[900], hex(pal[100]));
    // borders
    set('bd-100', pal[100], mix(pal[500], card, 0.20));
    set('bd-200', pal[200], mix(pal[500], card, 0.28));
    set('bd-300', pal[300], mix(pal[500], card, 0.38));

    for (const n of names) {
      backgroundColor[n] = { 50: ref(`${fam}-bg-50`), 100: ref(`${fam}-bg-100`), 200: ref(`${fam}-bg-200`) };
      textColor[n] = { 600: ref(`${fam}-tx-600`), 700: ref(`${fam}-tx-700`), 800: ref(`${fam}-tx-800`), 900: ref(`${fam}-tx-900`) };
      borderColor[n] = { 100: ref(`${fam}-bd-100`), 200: ref(`${fam}-bd-200`), 300: ref(`${fam}-bd-300`) };
    }
  }

  // Solid fills that carry white text: the 400/500 shades of these are too light for 4.5:1, so use the deeper one.
  for (const [fam, solid] of Object.entries(tokens.statusSolid)) {
    if (fam === '_comment') continue;
    backgroundColor[fam] = { ...(backgroundColor[fam] ?? {}), 400: solid, 500: solid };
    if (fam === 'emerald') backgroundColor.teal = { ...(backgroundColor.teal ?? {}), 400: solid, 500: solid };
  }

  return { vars: { ':root': root, '.dark': dark }, backgroundColor, textColor, borderColor };
}
