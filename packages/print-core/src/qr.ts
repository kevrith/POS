// QR code rendering without a network or a script tag. The receipt HTML embeds the
// result as an inline SVG, so the KRA code prints offline and the page needs no JavaScript.

import qrcode from 'qrcode-generator';

/** Dark/light module matrix for `text`, error correction M. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M'); // type 0: pick the smallest version that fits
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let y = 0; y < n; y++) {
    const r: boolean[] = [];
    for (let x = 0; x < n; x++) r.push(qr.isDark(y, x));
    rows.push(r);
  }
  return rows;
}

/** Inline SVG, `sizePx` square, with the 4-module quiet zone the QR spec asks for. */
export function qrSvg(text: string, sizePx: number): string {
  const m = qrMatrix(text);
  const quiet = 4;
  const total = m.length + quiet * 2;
  let path = '';
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m.length; x++) {
      if (m[y][x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}
