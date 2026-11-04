// Block layout -> Star WebPRNT XML. The wire format is carried over unchanged from the
// previous generator; it has not been verified against a Star printer (see the print README).

import type { Block, Size } from './layout';
import { PAPER_COLUMNS, type PaperWidth } from './model';
import { asciiSafe, row, wrapText } from './text';

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sizeAttrs(size: Size): string {
  if (size === 'xl') return ' width="3" height="3"';
  if (size === 'large') return ' width="2" height="1"';
  return '';
}

export function renderStarXml(blocks: Block[], options: { paperWidth: PaperWidth }): string {
  const cols = PAPER_COLUMNS[options.paperWidth];
  const out: string[] = ['<initialization/>'];
  const textLine = (content: string, size: Size, bold: boolean) => {
    const el = `<text${sizeAttrs(size)}>${xmlEscape(content)}</text>`;
    return `<line>${bold ? `<bold>${el}</bold>` : el}</line>`;
  };

  for (const block of blocks) {
    switch (block.kind) {
      case 'banner': {
        const size: Size = block.tone === 'void' || block.tone === 'info' ? 'large' : 'normal';
        out.push('<align value="center"/>');
        for (const l of wrapText(asciiSafe(block.text), cols)) out.push(textLine(l, size, true));
        break;
      }
      case 'line': {
        const size = block.size ?? 'normal';
        const width = size === 'xl' ? Math.floor(cols / 2) : cols;
        const prefix = block.indent ? '  ' : '';
        out.push(`<align value="${block.align ?? 'left'}"/>`);
        for (const l of wrapText(asciiSafe(block.text), width - prefix.length)) {
          out.push(textLine(prefix + l, size === 'small' ? 'normal' : size, !!block.bold));
        }
        break;
      }
      case 'row': {
        const size: Size = block.size === 'small' || !block.size ? 'normal' : block.size;
        const left = (block.indent ? '  ' : '') + asciiSafe(block.left);
        out.push('<align value="left"/>');
        out.push(textLine(row(left, asciiSafe(block.right), size === 'xl' ? Math.floor(cols / 2) : cols), size, !!block.bold));
        break;
      }
      case 'rule':
        out.push('<align value="left"/>', textLine((block.style === 'double' ? '=' : '-').repeat(cols), 'normal', false));
        break;
      case 'qr':
        out.push(`<qrcode model="2" level="M" cell="4" align="center">${xmlEscape(asciiSafe(block.data))}</qrcode>`);
        break;
      case 'gap':
        out.push(textLine('', 'normal', false));
        break;
    }
  }
  out.push('<cut type="partial"/>');

  return `<?xml version="1.0" encoding="utf-8"?>
<starwebprnt>
  <body>
    ${out.join('\n    ')}
  </body>
</starwebprnt>`;
}
