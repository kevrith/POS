// Block layout -> Epson ePOS-Print XML (SOAP over HTTP to TM-T88/T20/m30 series printers).

import type { Block, Size } from './layout';
import { PAPER_COLUMNS, type PaperWidth } from './model';
import { asciiSafe, bytesToHex, row, wrapText } from './text';
import { DRAWER_PULSE } from './escpos';

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function textEl(content: string, attrs: { align?: string; size?: Size; bold?: boolean }): string {
  const a: string[] = [];
  if (attrs.align) a.push(`align="${attrs.align}"`);
  a.push(`dw="${attrs.size === 'xl' ? 'true' : 'false'}"`);
  a.push(`dh="${attrs.size === 'large' || attrs.size === 'xl' ? 'true' : 'false'}"`);
  a.push(`em="${attrs.bold ? 'true' : 'false'}"`);
  return `<text ${a.join(' ')}>${xmlEscape(content)}&#10;</text>`;
}

export function renderEpsonXml(blocks: Block[], options: { paperWidth: PaperWidth; openDrawer?: boolean }): string {
  const cols = PAPER_COLUMNS[options.paperWidth];
  const out: string[] = ['<initialize/>'];
  if (options.openDrawer) out.push(`<command>${bytesToHex(DRAWER_PULSE)}</command>`);

  for (const block of blocks) {
    switch (block.kind) {
      case 'banner': {
        const size: Size = block.tone === 'void' || block.tone === 'info' ? 'large' : 'normal';
        for (const l of wrapText(asciiSafe(block.text), cols)) out.push(textEl(l, { align: 'center', size, bold: true }));
        break;
      }
      case 'line': {
        const size = block.size ?? 'normal';
        const width = size === 'xl' ? Math.floor(cols / 2) : cols;
        const prefix = block.indent ? '  ' : '';
        for (const l of wrapText(asciiSafe(block.text), width - prefix.length)) {
          out.push(textEl(prefix + l, { align: block.align ?? 'left', size: size === 'small' ? 'normal' : size, bold: block.bold }));
        }
        break;
      }
      case 'row': {
        const size: Size = block.size === 'small' || !block.size ? 'normal' : block.size;
        const left = (block.indent ? '  ' : '') + asciiSafe(block.left);
        out.push(textEl(row(left, asciiSafe(block.right), size === 'xl' ? Math.floor(cols / 2) : cols), { align: 'left', size, bold: block.bold }));
        break;
      }
      case 'rule':
        out.push(textEl((block.style === 'double' ? '=' : '-').repeat(cols), { align: 'left' }));
        break;
      case 'qr':
        out.push(`<symbol type="qrcode_model_2" level="level_m" width="4" height="0" size="0" align="center">${xmlEscape(asciiSafe(block.data))}</symbol>`);
        break;
      case 'gap':
        out.push('<feed line="1"/>');
        break;
    }
  }
  out.push('<feed line="3"/>', '<cut type="feed"/>');

  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
      ${out.join('\n      ')}
    </epos-print>
  </s:Body>
</s:Envelope>`;
}
