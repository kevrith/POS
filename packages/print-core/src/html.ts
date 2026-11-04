// Block layout -> a self-contained HTML document for the browser/OS print dialog.
// No scripts: the QR code is an inline SVG, so it prints offline and nothing races the print call.

import type { Block, BannerTone, Size } from './layout';
import { qrSvg } from './qr';
import { escapeHtml } from './text';
import type { PaperWidth } from './model';

const FONT_PX: Record<Size, number> = { small: 10, normal: 12, large: 16, xl: 28 };

const BANNER_STYLE: Record<BannerTone, string> = {
  void: 'background:#1a1a1a;color:#fff;border:3px solid #000;font-size:18px;letter-spacing:2px;font-weight:900',
  credit: 'background:#fef3c7;color:#92400e;border:2px solid #d97706;font-size:12px;font-weight:bold',
  pending: 'background:#fee2e2;color:#991b1b;border:2px solid #ef4444;font-size:11px;font-weight:bold',
  test: 'background:#fef9c3;color:#713f12;border:2px dashed #a16207;font-size:11px;font-weight:bold',
  offline: 'background:#e0f2fe;color:#075985;border:2px dashed #0369a1;font-size:11px;font-weight:bold',
  copy: 'background:#e5e7eb;color:#111;border:2px dashed #000;font-size:12px;font-weight:bold',
  info: 'background:#000;color:#fff;font-size:15px;font-weight:bold;letter-spacing:2px',
};

function renderBlock(block: Block): string {
  switch (block.kind) {
    case 'banner':
      return `<div style="${BANNER_STYLE[block.tone]};text-align:center;padding:6px 4px;margin:0 0 8px">${escapeHtml(block.text)}</div>`;
    case 'line': {
      const size = block.size ?? 'normal';
      const style = [
        `text-align:${block.align ?? 'left'}`,
        `font-size:${FONT_PX[size]}px`,
        block.bold || size === 'xl' ? 'font-weight:bold' : '',
        block.muted ? 'color:#666' : '',
        block.indent ? 'padding-left:12px' : '',
        'word-break:break-word',
      ].filter(Boolean).join(';');
      return `<div style="${style}">${escapeHtml(block.text)}</div>`;
    }
    case 'row': {
      const size = block.size ?? 'normal';
      const style = [
        'display:flex',
        'justify-content:space-between',
        'gap:8px',
        `font-size:${FONT_PX[size]}px`,
        block.bold ? 'font-weight:bold' : '',
        block.muted ? 'color:#666' : '',
        block.indent ? 'padding-left:12px' : '',
      ].filter(Boolean).join(';');
      return `<div style="${style}"><span style="word-break:break-word">${escapeHtml(block.left)}</span><span style="white-space:nowrap">${escapeHtml(block.right)}</span></div>`;
    }
    case 'rule':
      return `<div style="border-top:${block.style === 'double' ? '2px solid' : '1px dashed'} #000;margin:5px 0"></div>`;
    case 'qr':
      return `<div style="text-align:center;margin:6px 0">${qrSvg(block.data, 110)}</div>`;
    case 'gap':
      return '<div style="height:8px"></div>';
  }
}

export function renderHtml(blocks: Block[], options: { paperWidth: PaperWidth; title: string }): string {
  const mm = options.paperWidth;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <style>
    @media print {
      @page { margin: 0; size: ${mm}mm auto; }
      body { margin: 0; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      line-height: 1.4;
      max-width: ${mm}mm;
      width: 100%;
      margin: 0 auto;
      padding: ${mm === 58 ? '4mm 2mm' : '8mm 6mm'};
      background: #fff;
      color: #000;
    }
  </style>
</head>
<body>
${blocks.map(renderBlock).join('\n')}
</body>
</html>`;
}
