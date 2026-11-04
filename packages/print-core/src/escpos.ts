// Block layout -> raw ESC/POS bytes (USB, Bluetooth, LAN, installed printer).

import type { Block, Size } from './layout';
import { PAPER_COLUMNS, type RenderOptions } from './model';
import { asciiSafe, row, wrapText } from './text';

const ESC = 0x1b;
const GS = 0x1d;

/** ESC p 0 25 250: pulse drawer pin 2. The drawer is wired to the printer's RJ11 port. */
export const DRAWER_PULSE = Uint8Array.of(ESC, 0x70, 0x00, 0x19, 0xfa);

class Bytes {
  private data: number[] = [];
  raw(...b: number[]) { this.data.push(...b); return this; }
  text(s: string) { for (let i = 0; i < s.length; i++) this.data.push(s.charCodeAt(i) & 0xff); return this; }
  line(s = '') { return this.text(s).raw(0x0a); }
  done() { return Uint8Array.from(this.data); }
}

// ESC ! n: bit0 font B, bit3 emphasized, bit4 double height, bit5 double width.
function modeByte(size: Size, bold: boolean): number {
  let n = bold ? 0x08 : 0;
  if (size === 'small') n |= 0x01;
  if (size === 'large') n |= 0x10;
  if (size === 'xl') n |= 0x30;
  return n;
}

const ALIGN = { left: 0, center: 1, right: 2 } as const;

/** GS ( k: Model 2 QR, error correction M. Printers have a built-in QR generator, so no bitmap is sent. */
function qrCommand(b: Bytes, data: string, cell: number): void {
  const payload = data.split('').map((c) => c.charCodeAt(0) & 0xff);
  const len = payload.length + 3;
  b.raw(GS, 0x28, 0x6b, 4, 0, 49, 65, 50, 0);          // model 2
  b.raw(GS, 0x28, 0x6b, 3, 0, 49, 67, cell);            // module size
  b.raw(GS, 0x28, 0x6b, 3, 0, 49, 69, 50);              // error correction M
  b.raw(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 49, 80, 48);
  b.raw(...payload);                                    // store data
  b.raw(GS, 0x28, 0x6b, 3, 0, 49, 81, 48);              // print
}

export function renderEscPos(blocks: Block[], options: RenderOptions): Uint8Array {
  const cols = PAPER_COLUMNS[options.paperWidth];
  const b = new Bytes();
  if (options.openDrawer) b.raw(...DRAWER_PULSE);
  b.raw(ESC, 0x40); // initialize

  const style = (size: Size, bold: boolean, align: keyof typeof ALIGN) => {
    b.raw(ESC, 0x61, ALIGN[align]);
    b.raw(ESC, 0x21, modeByte(size, bold));
    b.raw(ESC, 0x45, bold ? 1 : 0);
  };
  const reset = () => b.raw(ESC, 0x21, 0).raw(ESC, 0x45, 0);
  // Double-width characters take two columns each.
  const widthFor = (size: Size) => (size === 'xl' ? Math.floor(cols / 2) : cols);

  for (const block of blocks) {
    switch (block.kind) {
      case 'banner': {
        const size: Size = block.tone === 'void' || block.tone === 'info' ? 'large' : 'normal';
        style(size, true, 'center');
        for (const l of wrapText(asciiSafe(block.text), cols)) b.line(l);
        reset();
        break;
      }
      case 'line': {
        const size = block.size ?? 'normal';
        style(size, !!block.bold, block.align ?? 'left');
        const prefix = block.indent ? '  ' : '';
        for (const l of wrapText(asciiSafe(block.text), widthFor(size) - prefix.length)) b.line(prefix + l);
        reset();
        break;
      }
      case 'row': {
        const size = block.size ?? 'normal';
        // Font B is not used for rows: column counts differ between printer models, and a row must align exactly.
        const layoutSize: Size = size === 'small' ? 'normal' : size;
        style(layoutSize, !!block.bold, 'left');
        const left = (block.indent ? '  ' : '') + asciiSafe(block.left);
        b.line(row(left, asciiSafe(block.right), widthFor(layoutSize)));
        reset();
        break;
      }
      case 'rule':
        style('normal', false, 'left');
        b.line((block.style === 'double' ? '=' : '-').repeat(cols));
        break;
      case 'qr':
        b.raw(ESC, 0x61, ALIGN.center);
        qrCommand(b, block.data, 4);
        b.raw(0x0a);
        break;
      case 'gap':
        b.raw(0x0a);
        break;
    }
  }

  b.raw(ESC, 0x61, ALIGN.left);
  b.line().line().line();
  b.raw(GS, 0x56, 0x41, 0x00); // feed to the cutter and cut; ignored by printers without one
  return b.done();
}
