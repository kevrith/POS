// ESC/POS Receipt Template Engine
// Generates thermal printer commands and browser-printable HTML

import api from './api';
import { printRawToSystemPrinter } from './desktopPrinter';
import { asciiSafe, bytesToBase64, chunkBytes, encodeEscPos, escapeHtml, row, wrapText } from './printEncoding';

export interface ReceiptData {
  receiptNumber: string;
  businessName: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  date: string;
  cashierName: string;
  customerName?: string;
  customerPhone?: string;
  customerKraPin?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    discountPercent?: number;
  }>;
  subtotalCents: number;
  serviceChargeCents?: number;
  vatCents?: number;
  totCents?: number;
  totalCents: number;
  payments: Array<{
    method: string;
    amountCents: number;
    reference?: string;
  }>;
  changeCents?: number;
  tipCents?: number;
  kraQRCode?: string;          // intrlData from KRA — encoded in QR code
  kraControlNumber?: string;   // legacy
  etimsControlNumber?: string; // human-readable KRA control/receipt number shown on receipt
  etimsSubmitted?: boolean;
  voided?: boolean;
  isCreditSale?: boolean;
  previousBalanceCents?: number;  // customer's debt BEFORE this sale
  newBalanceCents?: number;       // customer's total debt AFTER this sale
  notes?: string;
  saleId?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  pointsEarned?: number;
  loyaltyBalance?: number;
}

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';

export const ESCPOS = {
  INIT: ESC + '@',
  ALIGN_LEFT: ESC + 'a' + '\x00',
  ALIGN_CENTER: ESC + 'a' + '\x01',
  ALIGN_RIGHT: ESC + 'a' + '\x02',
  BOLD_ON: ESC + 'E' + '\x01',
  BOLD_OFF: ESC + 'E' + '\x00',
  UNDERLINE_ON: ESC + '-' + '\x01',
  UNDERLINE_OFF: ESC + '-' + '\x00',
  FONT_SMALL: ESC + 'M' + '\x01',
  FONT_NORMAL: ESC + 'M' + '\x00',
  CUT: GS + 'V' + '\x41' + '\x00',
  FEED: '\n',
  DOUBLE_HEIGHT: ESC + '!' + '\x10',
  NORMAL_SIZE: ESC + '!' + '\x00',
  // Cash drawer: ESC p pin on-time off-time  (pin2=0x00, pin5=0x01)
  OPEN_DRAWER: ESC + 'p' + '\x00' + '\x19' + '\xFA',
};

/**
 * Generate ESC/POS QR code command sequence.
 * Uses GS ( k — Model 2 QR, error correction level M, size 4.
 */
function generateQRCommand(data: string, size = 4): string {
  const bytes = Array.from(new TextEncoder().encode(data));
  const dataLen = bytes.length + 3; // +3 for cn fn n
  const pL = dataLen & 0xff;
  const pH = (dataLen >> 8) & 0xff;

  const chr = (n: number) => String.fromCharCode(n);

  // 1. Set QR model (Model 2)
  const setModel = GS + '(k' + chr(4) + chr(0) + chr(49) + chr(65) + chr(50) + chr(0);
  // 2. Set size (1–8 dots per module)
  const setSize  = GS + '(k' + chr(3) + chr(0) + chr(49) + chr(67) + chr(size);
  // 3. Set error correction level M
  const setECC   = GS + '(k' + chr(3) + chr(0) + chr(49) + chr(69) + chr(50);
  // 4. Store data
  const storeHdr = GS + '(k' + chr(pL) + chr(pH) + chr(49) + chr(80) + chr(48);
  const storeData = bytes.map(chr).join('');
  // 5. Print
  const print    = GS + '(k' + chr(3) + chr(0) + chr(49) + chr(81) + chr(48);

  return setModel + setSize + setECC + storeHdr + storeData + print;
}

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Roll width of the thermal printer. Small Bluetooth printers use 58 mm; counter printers use 80 mm. */
export type PaperWidth = 58 | 80;

/** Characters per line in the standard font. */
export const PAPER_COLUMNS: Record<PaperWidth, number> = { 58: 32, 80: 48 };

const PAPER_KEY = 'receipt-paper-width';

/** The roll width chosen in Settings -> Printers, or null when the user never chose one. */
export function getPaperWidth(): PaperWidth | null {
  try {
    const v = Number(localStorage.getItem(PAPER_KEY));
    return v === 58 || v === 80 ? v : null;
  } catch {
    return null;
  }
}

export function setPaperWidth(width: PaperWidth): void {
  try { localStorage.setItem(PAPER_KEY, String(width)); } catch { /* storage unavailable */ }
}

function line(char: string = '-', width: number = 32): string {
  return char.repeat(width);
}

// ─── Payment grouping ─────────────────────────────────────────────────────────
// Groups payment lines by category for cleaner receipts.
// M-Pesa variants → "M-Pesa", Card variants → "Card", etc.
interface GroupedPayment {
  label: string;        // display name for the group header
  totalCents: number;
  lines: Array<{ method: string; amountCents: number; reference?: string }>;
  isGroup: boolean;     // true when multiple methods collapsed
}

function groupPayments(payments: ReceiptData['payments']): GroupedPayment[] {
  const classify = (method: string): string => {
    const m = method.toUpperCase();
    if (m.includes('MPESA') || m.includes('M-PESA') || m.includes('M_PESA') || m === 'MOBILE_MONEY' || m.includes('QR')) return 'MPESA';
    if (m.includes('CARD') || m.includes('VISA') || m.includes('MASTERCARD') || m.includes('PAYSTACK') || m === 'DEBIT' || m === 'CREDIT') return 'CARD';
    if (m === 'CASH' || m === 'CASH_EXACT') return 'CASH';
    if (m.includes('BANK') || m.includes('EFT') || m.includes('TRANSFER')) return 'BANK';
    if (m.includes('GIFT')) return 'GIFT';
    if (m.includes('LOYALTY') || m.includes('POINTS')) return 'LOYALTY';
    if (m.includes('ROOM')) return 'ROOM';
    return 'OTHER';
  };

  const GROUP_LABELS: Record<string, string> = {
    MPESA: 'M-Pesa',
    CARD: 'Card Payment',
    CASH: 'Cash',
    BANK: 'Bank Transfer',
    GIFT: 'Gift Card',
    LOYALTY: 'Loyalty Points',
    ROOM: 'Room Charge',
    OTHER: 'Other',
  };

  // Build buckets
  const buckets = new Map<string, ReceiptData['payments']>();
  for (const p of payments) {
    const key = classify(p.method);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }

  const result: GroupedPayment[] = [];
  for (const [key, lines] of buckets.entries()) {
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    result.push({
      label: GROUP_LABELS[key] ?? key,
      totalCents: total,
      lines,
      isGroup: lines.length > 1,
    });
  }
  return result;
}

// Generate ESC/POS commands for thermal printer
/** Reduce every user-entered string on a receipt to printable ASCII (thermal printers have no UTF-8). */
function sanitizeForEscPos(r: ReceiptData): ReceiptData {
  const t = (v?: string) => (v === undefined ? undefined : asciiSafe(v));
  return {
    ...r,
    receiptNumber: asciiSafe(r.receiptNumber),
    businessName: asciiSafe(r.businessName),
    storeName: asciiSafe(r.storeName),
    storeAddress: t(r.storeAddress),
    storePhone: t(r.storePhone),
    cashierName: asciiSafe(r.cashierName),
    customerName: t(r.customerName),
    customerKraPin: t(r.customerKraPin),
    etimsControlNumber: t(r.etimsControlNumber),
    kraControlNumber: t(r.kraControlNumber),
    receiptHeader: t(r.receiptHeader),
    receiptFooter: t(r.receiptFooter),
    items: r.items.map((i) => ({ ...i, name: asciiSafe(i.name) })),
    payments: r.payments.map((p) => ({ ...p, method: asciiSafe(p.method), reference: t(p.reference) })),
  };
}

export function generateESCPOS(
  rawReceipt: ReceiptData,
  enableCashDrawer = false,
  paperWidth: PaperWidth = getPaperWidth() ?? 58,
): string {
  const receipt = sanitizeForEscPos(rawReceipt);
  const cols = PAPER_COLUMNS[paperWidth];
  // Open cash drawer first if any payment is cash (drawer is wired to printer's RJ11 port)
  const hasCash = enableCashDrawer && receipt.payments.some(p => p.method === 'CASH' || p.method === 'CASH_EXACT');
  let output = hasCash ? ESCPOS.OPEN_DRAWER : '';
  output += ESCPOS.INIT;

  // VOID watermark
  if (receipt.voided) {
    output += ESCPOS.ALIGN_CENTER + ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
    output += '*** VOID ***' + ESCPOS.FEED;
    output += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
  }

  // Credit sale banner
  if (receipt.isCreditSale && !receipt.voided) {
    output += ESCPOS.ALIGN_CENTER + ESCPOS.BOLD_ON;
    output += '*** CREDIT SALE - AMOUNT DUE ***' + ESCPOS.FEED;
    if (receipt.customerName) output += `Debtor: ${receipt.customerName}` + ESCPOS.FEED;
    output += ESCPOS.BOLD_OFF;
  }

  // Pending KRA watermark
  if (receipt.etimsSubmitted === false && !receipt.voided) {
    output += ESCPOS.ALIGN_CENTER + ESCPOS.BOLD_ON;
    output += '*** PENDING KRA SUBMISSION ***' + ESCPOS.FEED;
    output += ESCPOS.BOLD_OFF;
  }

  // Header
  output += ESCPOS.ALIGN_CENTER + ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
  output += receipt.businessName + ESCPOS.FEED;
  output += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
  output += receipt.storeName + ESCPOS.FEED;
  if (receipt.storeAddress) output += receipt.storeAddress + ESCPOS.FEED;
  if (receipt.storePhone) output += receipt.storePhone + ESCPOS.FEED;
  output += ESCPOS.FEED;

  // Receipt info
  output += ESCPOS.ALIGN_LEFT + ESCPOS.FONT_SMALL;
  output += line('=', cols) + ESCPOS.FEED;
  output += `Receipt: ${receipt.receiptNumber}` + ESCPOS.FEED;
  output += `Date: ${asciiSafe(new Date(receipt.date).toLocaleString('en-KE'))}` + ESCPOS.FEED;
  output += `Cashier: ${receipt.cashierName}` + ESCPOS.FEED;
  if (receipt.customerName) {
    output += `Customer: ${receipt.customerName}` + ESCPOS.FEED;
  }
  if (receipt.customerKraPin) {
    output += `Buyer PIN: ${receipt.customerKraPin}` + ESCPOS.FEED;
  }
  output += line('=', cols) + ESCPOS.FEED;
  output += ESCPOS.FEED;

  // Items
  output += ESCPOS.FONT_NORMAL;
  receipt.items.forEach((item) => {
    for (const nameLine of wrapText(item.name, cols)) output += nameLine + ESCPOS.FEED;
    
    const qtyPrice = `${item.quantity} x ${formatKES(item.unitPriceCents)}`;
    const total = formatKES(item.totalCents);
    output += row(qtyPrice, total, cols) + ESCPOS.FEED;
    
    if (item.discountPercent && item.discountPercent > 0) {
      output += `  Discount: -${item.discountPercent}%` + ESCPOS.FEED;
    }
  });

  // Totals
  const taxCents = (receipt.vatCents ?? 0) + (receipt.totCents ?? 0);
  const subtotalLabel = receipt.vatCents && receipt.vatCents > 0 ? 'Subtotal(ex-VAT):' : receipt.totCents && receipt.totCents > 0 ? 'Subtotal(ex-TOT):' : 'Subtotal:';
  output += ESCPOS.FEED + line('-', cols) + ESCPOS.FEED;
  output += row(subtotalLabel, formatKES(receipt.subtotalCents - taxCents), cols) + ESCPOS.FEED;

  if (receipt.serviceChargeCents && receipt.serviceChargeCents > 0) {
    output += row('Service (10%):', formatKES(receipt.serviceChargeCents), cols) + ESCPOS.FEED;
  }

  if (receipt.vatCents && receipt.vatCents > 0) {
    output += row('VAT (16%):', formatKES(receipt.vatCents), cols) + ESCPOS.FEED;
  }

  if (receipt.totCents && receipt.totCents > 0) {
    output += row('TOT (3%):', formatKES(receipt.totCents), cols) + ESCPOS.FEED;
  }
  if (receipt.tipCents && receipt.tipCents > 0) {
    output += row('Tip/Gratuity:', formatKES(receipt.tipCents), cols) + ESCPOS.FEED;
  }

  output += line('-', cols) + ESCPOS.FEED;
  output += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
  output += row('TOTAL:', formatKES(receipt.totalCents), cols) + ESCPOS.FEED;
  output += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
  output += line('-', cols) + ESCPOS.FEED;

  // Payments
  output += ESCPOS.FEED;
  if (receipt.isCreditSale && !receipt.voided) {
    output += ESCPOS.BOLD_ON;
    output += row('CREDIT THIS SALE:', formatKES(receipt.totalCents), cols) + ESCPOS.FEED;
    output += ESCPOS.BOLD_OFF;
    if (receipt.previousBalanceCents !== undefined && receipt.previousBalanceCents < 0) {
      output += row('PREV BALANCE OWED:', formatKES(Math.abs(receipt.previousBalanceCents)), cols) + ESCPOS.FEED;
    }
    if (receipt.newBalanceCents !== undefined) {
      output += line('-', cols) + ESCPOS.FEED;
      output += ESCPOS.BOLD_ON;
      output += row('TOTAL OUTSTANDING:', formatKES(Math.abs(receipt.newBalanceCents)), cols) + ESCPOS.FEED;
      output += ESCPOS.BOLD_OFF;
    }
  } else {
    const groups = groupPayments(receipt.payments);
    groups.forEach((group) => {
      if (group.isGroup) {
        // Group header with total
        output += ESCPOS.BOLD_ON;
        output += row(group.label + ':', formatKES(group.totalCents), cols) + ESCPOS.FEED;
        output += ESCPOS.BOLD_OFF;
        // Sub-lines indented
        group.lines.forEach((p) => {
          const label = '  ' + p.method + (p.reference ? ` (${p.reference})` : '');
          output += row(label, formatKES(p.amountCents), cols) + ESCPOS.FEED;
        });
      } else {
        const p = group.lines[0];
        const label = group.label + (p.reference ? ` (${p.reference})` : '');
        output += row(label, formatKES(p.amountCents), cols) + ESCPOS.FEED;
      }
    });
    if (receipt.changeCents && receipt.changeCents > 0) {
      output += ESCPOS.BOLD_ON;
      output += row('CHANGE:', formatKES(receipt.changeCents), cols) + ESCPOS.FEED;
      output += ESCPOS.BOLD_OFF;
    }
  }

  if ((receipt.pointsEarned ?? 0) > 0 || (receipt.loyaltyBalance ?? 0) > 0) {
    output += ESCPOS.FEED + line('-', cols) + ESCPOS.FEED;
    output += ESCPOS.ALIGN_CENTER + ESCPOS.BOLD_ON;
    if ((receipt.pointsEarned ?? 0) > 0) {
      output += `+${receipt.pointsEarned} LOYALTY POINTS EARNED` + ESCPOS.FEED;
    }
    output += ESCPOS.BOLD_OFF;
    output += `Loyalty balance: ${(receipt.loyaltyBalance ?? 0).toLocaleString()} pts` + ESCPOS.FEED;
    output += ESCPOS.ALIGN_LEFT;
  }

  // KRA eTIMS Section
  const kraRef = receipt.etimsControlNumber ?? receipt.kraControlNumber;
  if (receipt.etimsSubmitted && kraRef) {
    output += ESCPOS.FEED + line('=', cols) + ESCPOS.FEED;
    output += ESCPOS.ALIGN_CENTER + ESCPOS.BOLD_ON;
    output += 'KRA eTIMS VERIFIED' + ESCPOS.FEED;
    output += ESCPOS.BOLD_OFF;
    output += `Control No: ${kraRef}` + ESCPOS.FEED;
    if (receipt.kraQRCode) {
      output += ESCPOS.ALIGN_CENTER;
      output += generateQRCommand(receipt.kraQRCode, 4);
      output += ESCPOS.FEED;
      output += ESCPOS.FONT_SMALL + 'Scan QR to verify on KRA portal' + ESCPOS.FEED + ESCPOS.FONT_NORMAL;
    }
    output += line('-', cols) + ESCPOS.FEED;
  } else if (receipt.etimsSubmitted === false && !receipt.voided) {
    output += ESCPOS.FEED + ESCPOS.ALIGN_CENTER + ESCPOS.FONT_SMALL;
    output += '** PENDING KRA SUBMISSION **' + ESCPOS.FEED;
    output += ESCPOS.FONT_NORMAL;
  }

  // Footer
  output += ESCPOS.FEED + ESCPOS.ALIGN_CENTER;
  if (receipt.receiptHeader) {
    output += ESCPOS.FONT_SMALL + receipt.receiptHeader + ESCPOS.FEED + ESCPOS.FONT_NORMAL;
  }
  output += 'Thank you for your business!' + ESCPOS.FEED;
  if (receipt.receiptFooter) {
    output += ESCPOS.FONT_SMALL + receipt.receiptFooter + ESCPOS.FEED;
  }
  output += ESCPOS.FONT_SMALL + 'Powered by: Kastra Systems' + ESCPOS.FEED + ESCPOS.FONT_NORMAL;
  output += ESCPOS.FEED + ESCPOS.FEED;

  // Cut paper
  output += ESCPOS.CUT;

  return output;
}


// Generate HTML for browser printing
export function generateHTML(receipt: ReceiptData, paperWidth: PaperWidth = getPaperWidth() ?? 80): string {
  // Pre-compute loyalty section before the template literal
  const pe = receipt.pointsEarned ?? 0;
  const lb = receipt.loyaltyBalance ?? 0;
  const loyaltySectionHtml = (pe > 0 || lb > 0)
    ? '<div style="border-top:2px solid #000;margin:6px 0"></div>'
      + '<div style="text-align:center;padding:8px 4px;background:#fffbeb;border:1px dashed #d97706;border-radius:6px;margin:4px 0">'
      + (pe > 0
        ? '<div style="font-weight:bold;font-size:14px;color:#92400e">+' + pe + ' Loyalty Points Earned!</div>'
        : '<div style="font-weight:bold;font-size:14px;color:#92400e">Loyalty Points</div>')
      + '<div style="font-size:12px;color:#78350f;margin-top:3px">Your balance: <strong>' + lb.toLocaleString() + ' pts</strong></div>'
      + '</div>'
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${receipt.receiptNumber}</title>
  <style>
    @media print {
      @page { margin: 0; size: ${paperWidth}mm auto; }
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      max-width: ${paperWidth}mm;
      width: 100%;
      margin: 0 auto;
      padding: 8mm 10mm;
      background: #fff;
      color: #000;
    }
    @media screen and (max-width: 480px) {
      body { padding: 4mm 5mm; font-size: 13px; }
    }
    .print-btn {
      display: block;
      width: 100%;
      padding: 12px;
      margin-bottom: 12px;
      background: #1d4ed8;
      color: #fff;
      font-size: 16px;
      font-weight: bold;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: system-ui, sans-serif;
    }
    .print-btn:active { opacity: 0.8; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 16px; }
    .line { border-top: 1px dashed #000; margin: 5px 0; }
    .row { display: flex; justify-content: space-between; }
    .small { font-size: 10px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; }
    .right { text-align: right; }
    .pending-watermark {
      background: #fee2e2;
      border: 2px solid #ef4444;
      color: #991b1b;
      text-align: center;
      font-weight: bold;
      font-size: 11px;
      padding: 6px 4px;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .void-watermark {
      background: #1a1a1a;
      color: #fff;
      text-align: center;
      font-weight: 900;
      font-size: 22px;
      padding: 10px 4px;
      margin-bottom: 8px;
      letter-spacing: 4px;
      border: 3px solid #000;
    }
    .credit-watermark {
      background: #fef3c7;
      border: 2px solid #d97706;
      color: #92400e;
      text-align: center;
      font-weight: bold;
      font-size: 12px;
      padding: 8px 4px;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
  <button class="print-btn no-print" onclick="window.print()">Print Receipt</button>
  ${receipt.voided ? `<div class="void-watermark">*** VOID ***</div>` : ''}
  ${receipt.isCreditSale && !receipt.voided ? `<div class="credit-watermark">*** CREDIT SALE - AMOUNT DUE: ${formatKES(receipt.totalCents)} ***</div>` : ''}
  ${receipt.etimsSubmitted === false && !receipt.voided ? `<div class="pending-watermark">** PENDING KRA SUBMISSION **</div>` : ''}
  <div class="center bold large">${escapeHtml(receipt.businessName)}</div>
  <div class="center">${escapeHtml(receipt.storeName)}</div>
  ${receipt.storeAddress ? `<div class="center small">${escapeHtml(receipt.storeAddress)}</div>` : ''}
  ${receipt.storePhone ? `<div class="center small">${escapeHtml(receipt.storePhone)}</div>` : ''}
  
  <div class="line"></div>
  
  <table class="small">
    <tr><td>Receipt:</td><td class="right bold">${escapeHtml(receipt.receiptNumber)}</td></tr>
    <tr><td>Date:</td><td class="right">${new Date(receipt.date).toLocaleString('en-KE')}</td></tr>
    <tr><td>Cashier:</td><td class="right">${escapeHtml(receipt.cashierName)}</td></tr>
    ${receipt.customerName ? `<tr><td>Customer:</td><td class="right">${escapeHtml(receipt.customerName)}</td></tr>` : ''}
    ${receipt.customerKraPin ? `<tr><td>Buyer PIN:</td><td class="right">${escapeHtml(receipt.customerKraPin)}</td></tr>` : ''}
  </table>

  <div class="line"></div>
  
  ${receipt.items.map(item => `
    <div>
      <div class="bold">${escapeHtml(item.name)}</div>
      <div class="row small">
        <span>${item.quantity} × ${formatKES(item.unitPriceCents)}</span>
        <span class="bold">${formatKES(item.totalCents)}</span>
      </div>
      ${item.discountPercent && item.discountPercent > 0 ? `<div class="small">Discount: -${item.discountPercent}%</div>` : ''}
    </div>
  `).join('')}
  
  <div class="line"></div>
  
  <table>
    <tr><td>${receipt.vatCents && receipt.vatCents > 0 ? 'Subtotal (ex-VAT):' : receipt.totCents && receipt.totCents > 0 ? 'Subtotal (ex-TOT):' : 'Subtotal:'}</td><td class="right">${formatKES(receipt.subtotalCents - (receipt.vatCents ?? 0) - (receipt.totCents ?? 0))}</td></tr>
    ${receipt.serviceChargeCents && receipt.serviceChargeCents > 0 ? `<tr><td>Service (10%):</td><td class="right">${formatKES(receipt.serviceChargeCents)}</td></tr>` : ''}
    ${receipt.vatCents && receipt.vatCents > 0 ? `<tr><td>VAT (16%):</td><td class="right">${formatKES(receipt.vatCents)}</td></tr>` : ''}
    ${receipt.totCents && receipt.totCents > 0 ? `<tr><td>TOT (3%):</td><td class="right">${formatKES(receipt.totCents)}</td></tr>` : ''}
    ${receipt.tipCents && receipt.tipCents > 0 ? `<tr><td>Tip/Gratuity:</td><td class="right">${formatKES(receipt.tipCents)}</td></tr>` : ''}
    <tr class="bold large"><td>TOTAL:</td><td class="right">${formatKES(receipt.totalCents)}</td></tr>
  </table>
  
  <div class="line"></div>
  
  <table class="small">
    ${receipt.isCreditSale ? `
      <tr style="color:#92400e;font-weight:bold">
        <td>CREDIT (This Sale)</td>
        <td class="right">${formatKES(receipt.totalCents)}</td>
      </tr>
      ${receipt.customerName ? `<tr><td>Debtor:</td><td class="right">${escapeHtml(receipt.customerName)}</td></tr>` : ''}
      ${receipt.previousBalanceCents !== undefined && receipt.previousBalanceCents < 0 ? `
        <tr style="color:#b45309"><td>Previous Balance Owed:</td><td class="right">${formatKES(Math.abs(receipt.previousBalanceCents))}</td></tr>
      ` : ''}
      ${receipt.newBalanceCents !== undefined ? `
        <tr style="color:#991b1b;font-weight:bold;border-top:1px solid #fca5a5"><td>TOTAL OUTSTANDING:</td><td class="right">${formatKES(Math.abs(receipt.newBalanceCents))}</td></tr>
      ` : ''}
    ` : (() => {
        const groups = groupPayments(receipt.payments);
        return groups.map(group => {
          if (group.isGroup) {
            return `
              <tr style="border-top:1px solid #e5e7eb">
                <td style="font-weight:600;padding-top:4px">${group.label}</td>
                <td class="right" style="font-weight:600;padding-top:4px">${formatKES(group.totalCents)}</td>
              </tr>
              ${group.lines.map(p => `
                <tr>
                  <td style="padding-left:12px;color:#6b7280;font-size:10px">${escapeHtml(p.method)}${p.reference ? ` - ${escapeHtml(p.reference)}` : ''}</td>
                  <td class="right" style="color:#6b7280;font-size:10px">${formatKES(p.amountCents)}</td>
                </tr>
              `).join('')}`;
          }
          const p = group.lines[0];
          return `<tr><td>${group.label}${p.reference ? ` (${escapeHtml(p.reference)})` : ''}</td><td class="right">${formatKES(p.amountCents)}</td></tr>`;
        }).join('');
      })()}
    ${receipt.changeCents && receipt.changeCents > 0 && !receipt.isCreditSale ? `<tr class="bold"><td>CHANGE:</td><td class="right">${formatKES(receipt.changeCents)}</td></tr>` : ''}
  </table>

  ${loyaltySectionHtml}
  
  ${receipt.etimsSubmitted && (receipt.etimsControlNumber ?? receipt.kraControlNumber) ? `
    <div class="line"></div>
    <div class="center small">
      <div style="font-weight:bold;font-size:11px;letter-spacing:0.5px">KRA eTIMS VERIFIED</div>
      <div style="margin:2px 0">Control No: <strong>${escapeHtml(receipt.etimsControlNumber ?? receipt.kraControlNumber)}</strong></div>
      ${receipt.kraQRCode ? `
        <div id="kra-qr" style="margin:6px auto;display:inline-block"></div>
        <script>
          (function(){
            var el=document.getElementById('kra-qr');
            new QRCode(el,{text:${JSON.stringify(receipt.kraQRCode).replace(/</g, '\\u003c')},width:90,height:90,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
          })();
        <\/script>
        <div style="font-size:9px;margin-top:2px">Scan to verify on KRA eTIMS portal</div>
      ` : ''}
    </div>
  ` : receipt.etimsSubmitted === false && !receipt.voided ? `
    <div class="center small" style="color:#b45309;font-size:10px;margin:4px 0">** PENDING KRA SUBMISSION **</div>
  ` : ''}
  
  <div class="line"></div>
  ${receipt.receiptHeader ? `<div class="center small" style="margin-bottom:4px">${escapeHtml(receipt.receiptHeader)}</div>` : ''}
  <div class="center small">
    <div>Thank you for your business!</div>
    ${receipt.receiptFooter ? `<div style="margin-top:4px">${escapeHtml(receipt.receiptFooter)}</div>` : ''}
    <div style="margin-top:4px;color:#888">Powered by: Kastra Systems</div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Print an HTML document through a hidden iframe. Unlike window.open this is not
 * subject to popup blocking, which matters because receipts, reprints and kitchen
 * tickets are printed after awaiting the network, when the click that started
 * them no longer counts as a user gesture. Throws if the document cannot be set up.
 */
function printHtml(html: string, delayMs = 500): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error('Could not open the print preview');
  }
  const cleanup = () => { setTimeout(() => iframe.remove(), 1000); };
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener('afterprint', cleanup);
  // Let fonts and the QR script settle before the print dialog snapshots the page.
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { cleanup(); }
  }, delayMs);
  // Some browsers never fire afterprint (dialog dismissed on mobile); do not leak the frame.
  setTimeout(cleanup, 120000);
}

// Print to browser / OS print dialog
export function printToBrowser(receipt: ReceiptData): void {
  printHtml(generateHTML(receipt));
}

// ─── Bill (Pre-receipt for table) ─────────────────────────────────────────────

export interface BillData {
  tableNumber: string;
  businessName: string;
  waiterName?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  subtotalCents: number;
  totalCents: number;
  date: string;
  footer?: string;
  /**
   * Tax included in the total, as charged by this business. A bill is printed
   * before the sale exists, so the caller has to supply it from the business
   * tax settings — omit both for a business with tax turned off.
   */
  vatCents?: number;
  totCents?: number;
}

export function generateBillHTML(bill: BillData): string {
  const paperMm = getPaperWidth() ?? 80;
  // Tax is whatever the caller charges. This used to hardcode 16/116 of the
  // total, so a business with tax turned off (or on TOT) still printed a VAT
  // line it never charged.
  const vatCents = bill.vatCents ?? 0;
  const totCents = bill.totCents ?? 0;
  const taxLabel = totCents > 0 ? 'TOT (3%) included' : 'VAT (16%) included';
  const taxCents = totCents > 0 ? totCents : vatCents;
  const totalLabel = taxCents > 0 ? `TOTAL (${totCents > 0 ? 'TOT' : 'VAT'} incl.):` : 'TOTAL:';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill - Table ${escapeHtml(bill.tableNumber)}</title>
  <style>
    @media print { @page { margin: 0; size: ${paperMm}mm auto; } body { margin: 0; } }
    body { font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5;
           max-width: ${paperMm}mm; margin: 0 auto; padding: 8mm; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 16px; }
    .xl { font-size: 22px; font-weight: 900; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; }
    .small { font-size: 10px; }
    .muted { color: #555; }
    .bill-header { background: #000; color: #fff; text-align: center; padding: 6px;
                   font-size: 15px; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="bill-header">BILL</div>
  <div class="center bold large">${escapeHtml(bill.businessName)}</div>
  <div class="center xl">Table ${escapeHtml(bill.tableNumber)}</div>
  <div class="center small">${new Date(bill.date).toLocaleString('en-KE')}${bill.waiterName ? ` - Served by: ${escapeHtml(bill.waiterName)}` : ''}</div>
  <div class="line"></div>
  ${bill.items.map((item) => `
    <div style="margin-bottom:4px">
      <div class="bold">${escapeHtml(item.name)}</div>
      <div class="row small"><span>${item.quantity} x KES ${(item.unitPriceCents / 100).toFixed(2)}</span><span class="bold">KES ${(item.totalCents / 100).toFixed(2)}</span></div>
    </div>
  `).join('')}
  <div class="line"></div>
  <div class="row bold large" style="margin-bottom:4px"><span>${totalLabel}</span><span>KES ${(bill.totalCents / 100).toFixed(2)}</span></div>
  ${taxCents > 0 ? `<div class="row small muted"><span>  ${taxLabel}:</span><span>KES ${(taxCents / 100).toFixed(2)}</span></div>` : ''}
  <div class="line"></div>
  ${bill.footer ? `<div class="center small" style="margin-top:6px">${escapeHtml(bill.footer)}</div>` : ''}
  <div class="center small" style="margin-top:6px">Please check your bill and inform staff of any errors.</div>
  <div class="center small">Thank you for dining with us!</div>
  <div class="center small muted" style="margin-top:8px">Powered by: Kastra Systems</div>
</body>
</html>`.trim();
}

export function printBill(bill: BillData): void {
  printHtml(generateBillHTML(bill), 400);
}

// ─── KOT (Kitchen Order Ticket) ───────────────────────────────────────────────

export interface KOTData {
  kotNumber?: string;
  tableNumber: string;
  orderType: 'NEW_ORDER' | 'ADDITION';
  items: Array<{
    name: string;
    quantity: number;
    specialInstructions?: string;
    modifiers?: string[];
    /** Used for printer routing: 'FOOD' | 'DRINKS' | 'DESSERTS' etc. */
    category?: string;
  }>;
  createdAt: string;
  waiterName?: string;
}

/** Printer handle → category keywords mapping for routing */
const PRINTER_HANDLE_CATEGORIES: Record<string, string[]> = {
  KOT_FOOD:     ['food', 'main', 'snack', 'starter', 'salad', 'soup', 'dessert', 'pizza', 'burger', 'chicken', 'beef', 'pork', 'fish', 'bread'],
  KOT_DRINKS:   ['drink', 'beverage', 'juice', 'soda', 'water', 'beer', 'wine', 'spirits', 'coffee', 'tea', 'milk', 'smoothie', 'cocktail', 'mocktail'],
  KOT_DESSERTS: ['dessert', 'cake', 'ice cream', 'sweet', 'pastry'],
};

function categorizeKOTItem(itemName: string, category?: string): string {
  const target = (category ?? itemName).toLowerCase();
  for (const [handle, keywords] of Object.entries(PRINTER_HANDLE_CATEGORIES)) {
    if (keywords.some((kw) => target.includes(kw))) return handle;
  }
  return 'KOT_FOOD'; // default to food printer
}

export interface RoutablePrinter {
  id?: string;
  connectionType: string;
  connectionDetails: string;
  /** The API stores handles as a JSON string; older callers pass the parsed array. */
  handles: string[] | string;
}

function parseHandles(handles: RoutablePrinter['handles']): string[] {
  if (Array.isArray(handles)) return handles;
  try { const parsed = JSON.parse(handles); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

/** How a configured printer row is reached, or null when only a browser/OS print can serve it. */
function printerToKotConfig(p: RoutablePrinter): KOTPrinterConfig | null {
  const details = p.connectionDetails?.trim();
  switch (p.connectionType) {
    case 'STAR': return details ? { type: 'STAR', host: details } : null;
    case 'EPSON': return details ? { type: 'EPSON', host: details } : null;
    case 'NETWORK': return p.id ? { type: 'NETWORK_ESCPOS', networkPrinterId: p.id } : null;
    default: return null;
  }
}

/**
 * Print a KOT with printer routing: items are split by destination handle
 * (KOT_FOOD, KOT_DRINKS, KOT_DESSERTS) and each group is sent to the printer
 * that handles it. Items with no reachable printer are combined into a single
 * browser ticket, so a kitchen order is never lost and never opens one popup
 * per category. printKOTDirect itself falls back to the browser on a send error.
 */
export async function printKOTWithRouting(kot: KOTData, printers: RoutablePrinter[]): Promise<void> {
  const groups: Record<string, KOTData['items']> = {};
  for (const item of kot.items) {
    const handle = categorizeKOTItem(item.name, item.category);
    (groups[handle] ??= []).push(item);
  }

  const unrouted: KOTData['items'] = [];
  const jobs: Array<Promise<void>> = [];
  for (const [handle, items] of Object.entries(groups)) {
    const printer = printers.find((p) => parseHandles(p.handles).includes(handle));
    const config = printer ? printerToKotConfig(printer) : null;
    if (config) jobs.push(printKOTDirect(config, { ...kot, items }));
    else unrouted.push(...items);
  }
  if (unrouted.length > 0 || Object.keys(groups).length === 0) {
    printKOT({ ...kot, items: Object.keys(groups).length === 0 ? kot.items : unrouted });
  }
  await Promise.all(jobs);
}

export function generateKOTHTML(kot: KOTData): string {
  const paperMm = getPaperWidth() ?? 80;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>KOT T${escapeHtml(kot.tableNumber)}</title>
  <style>
    @media print { @page { margin: 0; size: ${paperMm}mm auto; } body { margin: 0; } }
    body { font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.6;
           max-width: ${paperMm}mm; margin: 0 auto; padding: 8mm; }
    h1 { font-size: 20px; text-align: center; margin: 0 0 2px; letter-spacing: 2px; }
    .table { font-size: 36px; font-weight: 900; text-align: center; margin: 4px 0; }
    .meta { font-size: 11px; text-align: center; color: #444; margin-bottom: 4px; }
    .type-badge { display: inline-block; background: #000; color: #fff; font-size: 11px;
                  font-weight: bold; padding: 3px 10px; border-radius: 4px;
                  letter-spacing: 1px; text-transform: uppercase; }
    .type-wrap { text-align: center; margin: 6px 0; }
    .line { border-top: 2px dashed #000; margin: 8px 0; }
    .item { display: flex; gap: 8px; margin: 6px 0; align-items: baseline; }
    .qty { font-size: 20px; font-weight: 900; min-width: 32px; }
    .item-name { font-size: 16px; font-weight: bold; flex: 1; }
    .note { font-size: 12px; margin-left: 40px; color: #333; font-style: italic; }
    .mod { font-size: 11px; margin-left: 40px; color: #555; }
  </style>
</head>
<body>
  <h1>KITCHEN ORDER</h1>
  <div class="table">T${escapeHtml(kot.tableNumber)}</div>
  <div class="meta">${new Date(kot.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}${kot.waiterName ? ` - ${escapeHtml(kot.waiterName)}` : ''}${kot.kotNumber ? ` - KOT #${escapeHtml(kot.kotNumber)}` : ''}</div>
  <div class="type-wrap"><span class="type-badge">${kot.orderType === 'ADDITION' ? '+ ADDITION' : 'NEW ORDER'}</span></div>
  <div class="line"></div>
  ${kot.items.map((item) => `
    <div class="item"><span class="qty">${item.quantity}×</span><span class="item-name">${escapeHtml(item.name)}</span></div>
    ${item.specialInstructions ? `<div class="note">!! ${escapeHtml(item.specialInstructions)}</div>` : ''}
    ${(item.modifiers ?? []).map((m) => `<div class="mod">+ ${escapeHtml(m)}</div>`).join('')}
  `).join('')}
  <div class="line"></div>
</body>
</html>`.trim();
}

export function printKOT(kot: KOTData): void {
  printHtml(generateKOTHTML(kot), 300);
}

// ─── Raw ESC/POS transports ───────────────────────────────────────────────────
// USB, Bluetooth and LAN all end up as "write these bytes to the printer". A
// printer is paired once from Settings -> Printers; after that a sale prints
// without any picker. Browsers only allow a device chooser during a user
// gesture, so the paired device is looked up silently (getDevices) at print time.

export interface PairedPrinter { id?: string; vendorId?: number; productId?: number; name: string }

const USB_PAIRED_KEY = 'usb-printer';
const BT_PAIRED_KEY = 'bt-printer';

function readPaired(key: string): PairedPrinter | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as PairedPrinter) : null; } catch { return null; }
}
function writePaired(key: string, value: PairedPrinter): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const getPairedUsbPrinter = () => readPaired(USB_PAIRED_KEY);
export const getPairedBluetoothPrinter = () => readPaired(BT_PAIRED_KEY);

// ---- USB (WebUSB: Chrome, Edge, Android Chrome)

const USB_FILTERS = [{ classCode: 7 }, { classCode: 255 }]; // printer class, vendor-specific

/* eslint-disable @typescript-eslint/no-explicit-any */
function usbApi(): any {
  const usb = (navigator as any).usb;
  if (!usb) throw new Error('This browser cannot talk to USB printers (WebUSB). Use Chrome or Edge, or choose a network printer.');
  return usb;
}

/** Ask the user to pick a USB printer and remember it. Must run from a click. */
export async function pairUsbPrinter(): Promise<PairedPrinter> {
  const device = await usbApi().requestDevice({ filters: USB_FILTERS });
  const paired: PairedPrinter = {
    vendorId: device.vendorId,
    productId: device.productId,
    name: device.productName || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`,
  };
  writePaired(USB_PAIRED_KEY, paired);
  return paired;
}

async function findUsbDevice(): Promise<any> {
  const usb = usbApi();
  const paired = getPairedUsbPrinter();
  const granted: any[] = await usb.getDevices();
  const match = paired
    ? granted.find((d) => d.vendorId === paired.vendorId && d.productId === paired.productId)
    : granted.length === 1 ? granted[0] : undefined;
  if (match) return match;
  try {
    // Only succeeds while a click is still being handled (manual "Print" buttons).
    return await usb.requestDevice({ filters: USB_FILTERS });
  } catch {
    throw new Error('No USB printer is paired on this device. Open Settings -> Printers and pair it.');
  }
}

/** Send raw bytes to the paired USB printer, finding its bulk OUT endpoint instead of assuming one. */
export async function printRawUSB(bytes: Uint8Array): Promise<void> {
  const device = await findUsbDevice();
  await device.open();
  try {
    if (device.configuration === null) await device.selectConfiguration(1);
    const candidates: Array<{ iface: any; alt: any; ep: any }> = [];
    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        const ep = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk');
        if (ep) candidates.push({ iface, alt, ep });
      }
    }
    candidates.sort((a, b) => Number(b.alt.interfaceClass === 7) - Number(a.alt.interfaceClass === 7));
    const target = candidates[0];
    if (!target) throw new Error('This USB device has no writable endpoint, so it is not a printer.');
    await device.claimInterface(target.iface.interfaceNumber);
    try {
      if (target.alt.alternateSetting) await device.selectAlternateInterface(target.iface.interfaceNumber, target.alt.alternateSetting);
      for (const chunk of chunkBytes(bytes, 4096)) await device.transferOut(target.ep.endpointNumber, chunk);
    } finally {
      await device.releaseInterface(target.iface.interfaceNumber).catch(() => undefined);
    }
  } finally {
    await device.close().catch(() => undefined);
  }
}

// ---- Bluetooth (Web Bluetooth: Chrome, Edge, Android Chrome; not iOS Safari)

// GATT services that cheap and branded BLE thermal printers expose for raw data.
const BT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];

let btDevice: any = null; // Kept for the page lifetime: a reload needs getDevices() or a re-pair.

function btApi(): any {
  const bt = (navigator as any).bluetooth;
  if (!bt) throw new Error('This browser cannot talk to Bluetooth printers. Use Chrome or Edge on Android or desktop, or choose a network printer.');
  return bt;
}

/** Ask the user to pick a Bluetooth printer and remember it. Must run from a click. */
export async function pairBluetoothPrinter(): Promise<PairedPrinter> {
  const device = await btApi().requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  btDevice = device;
  const paired: PairedPrinter = { id: device.id, name: device.name || 'Bluetooth printer' };
  writePaired(BT_PAIRED_KEY, paired);
  return paired;
}

async function findBluetoothDevice(): Promise<any> {
  if (btDevice) return btDevice;
  const bt = btApi();
  const paired = getPairedBluetoothPrinter();
  if (paired?.id && typeof bt.getDevices === 'function') {
    const known: any[] = await bt.getDevices();
    const match = known.find((d) => d.id === paired.id);
    if (match) { btDevice = match; return match; }
  }
  try {
    btDevice = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
    return btDevice;
  } catch {
    throw new Error('Bluetooth printer is not connected. Open Settings -> Printers and pair it again.');
  }
}

async function findWritableCharacteristic(server: any): Promise<any> {
  const services: any[] = await server.getPrimaryServices();
  services.sort((a, b) => BT_SERVICES.indexOf(a.uuid) - BT_SERVICES.indexOf(b.uuid) || 0);
  for (const service of services) {
    const characteristics: any[] = await service.getCharacteristics();
    const writable = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  throw new Error('The Bluetooth device has no writable channel, so it is not a supported printer.');
}

export async function printRawBluetooth(bytes: Uint8Array): Promise<void> {
  const device = await findBluetoothDevice();
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);
  // BLE writes are limited by the negotiated MTU; 100 bytes is safe on every stack.
  for (const chunk of chunkBytes(bytes, 100)) {
    if (characteristic.properties.writeWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
    else await characteristic.writeValue(chunk);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- LAN printer reached through the API (the API host must be on the same LAN as the printer)

export async function printRawNetwork(printerId: string, bytes: Uint8Array): Promise<void> {
  await api.post(`/printers/${printerId}/print`, { data: bytesToBase64(bytes) });
}

// ---- Receipt / drawer entry points

const DRAWER_PULSE = encodeEscPos(ESCPOS.OPEN_DRAWER);

/** Send cash drawer open pulse to a network printer (connected via RJ11 to printer). */
export async function openDrawerOnNetwork(printerId: string): Promise<void> {
  await printRawNetwork(printerId, DRAWER_PULSE);
}

/** Send cash drawer open pulse via the paired USB printer. */
export async function openDrawerViaUSB(): Promise<void> {
  await printRawUSB(DRAWER_PULSE);
}

// Print to Network/LAN thermal printer via API proxy
export async function printToNetwork(printerId: string, receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  await printRawNetwork(printerId, encodeEscPos(generateESCPOS(receipt, enableCashDrawer)));
}

// Print to a printer installed on this computer, silently, through the desktop app
export async function printToSystemPrinter(printerName: string, receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  await printRawToSystemPrinter(printerName, encodeEscPos(generateESCPOS(receipt, enableCashDrawer)));
}

// Print to USB thermal printer (WebUSB)
export async function printToUSB(receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  await printRawUSB(encodeEscPos(generateESCPOS(receipt, enableCashDrawer)));
}

// Print to Bluetooth thermal printer
export async function printToBluetooth(receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  await printRawBluetooth(encodeEscPos(generateESCPOS(receipt, enableCashDrawer)));
}

// ─── ZPL (Zebra Programming Language) Barcode Labels ─────────────────────────

export interface BarcodeLabelData {
  itemName: string;
  barcode: string;
  priceCents: number;
  businessName?: string;
  sku?: string;
  /** Label size in dots (203 DPI). Default: 2" × 1" = 406 × 203 */
  widthDots?: number;
  heightDots?: number;
}

/**
 * Generate ZPL II code for a single barcode label.
 * Compatible with Zebra ZT200/ZT400/ZD400 and any ZPL-compatible thermal printer.
 * Default label: 2" × 1" at 203 DPI.
 */
export function generateZPL(label: BarcodeLabelData): string {
  const w = label.widthDots ?? 406;   // 2" × 203 DPI
  const h = label.heightDots ?? 203;  // 1" × 203 DPI
  const price = `KES ${(label.priceCents / 100).toFixed(2)}`;

  // ^XA = start label
  // ^PW = print width  ^LL = label length
  // ^FO = field origin (x,y)
  // ^A = font  ^FD = field data  ^FS = field separator
  // ^BY = bar code field default (module width, ratio, height)
  // ^BC = Code 128 barcode
  // ^XZ = end label

  const lines: string[] = [
    '^XA',
    `^PW${w}`,
    `^LL${h}`,
    // Business name (top, small)
    ...(label.businessName
      ? [`^FO10,10^A0N,16,16^FD${label.businessName.substring(0, 30)}^FS`]
      : []),
    // Item name
    `^FO10,${label.businessName ? 30 : 10}^A0N,22,22^FD${label.itemName.substring(0, 28)}^FS`,
    // Barcode (Code 128)
    `^FO10,60^BY2,2.5,60`,
    `^BCN,60,Y,N,N`,
    `^FD${label.barcode}^FS`,
    // Price (right-aligned, bold)
    `^FO${w - 120},140^A0N,28,28^FD${price}^FS`,
    // SKU (small, bottom)
    ...(label.sku ? [`^FO10,175^A0N,14,14^FD${label.sku}^FS`] : []),
    '^XZ',
  ];

  return lines.join('\n');
}

/**
 * Print ZPL to a Zebra printer via WebUSB (Chrome/Edge).
 * Printer must be connected via USB.
 */
export async function printZPLviaUSB(label: BarcodeLabelData, copies = 1): Promise<void> {
  if (!('usb' in navigator)) {
    throw new Error('WebUSB not supported. Use Chrome or Edge.');
  }

  const zpl = generateZPL(label);
  const printJob = Array(copies).fill(zpl).join('\n');
  const encoder = new TextEncoder();
  const data = encoder.encode(printJob);

  try {
    const device = await (navigator as any).usb.requestDevice({
      filters: [
        { vendorId: 0x0A5F }, // Zebra Technologies
      ],
    });

    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);
    await device.transferOut(device.configuration.interfaces[0].alternate.endpoints.find((e: any) => e.direction === 'out').endpointNumber, data);
    await device.close();
  } catch (error: any) {
    console.error('ZPL USB print error:', error);
    throw new Error(`ZPL print failed: ${error.message}`);
  }
}

/**
 * Download ZPL as a .zpl file (for network Zebra printers or raw print spoolers).
 */
export function downloadZPL(label: BarcodeLabelData, copies = 1): void {
  const zpl = Array(copies).fill(generateZPL(label)).join('\n');
  const blob = new Blob([zpl], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `label-${label.barcode}.zpl`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Print ZPL via browser print dialog (renders barcode as HTML → browser handles print).
 * Fallback for environments without WebUSB or network Zebra printer access.
 */
export function printBarcodeLabel(label: BarcodeLabelData): void {
  const price = `KES ${(label.priceCents / 100).toFixed(2)}`;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Label ${escapeHtml(label.barcode)}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>
    @media print { @page { margin: 0; size: 50.8mm 25.4mm; } body { margin: 0; } }
    body { font-family: Arial, sans-serif; width: 50.8mm; height: 25.4mm; overflow: hidden;
           display: flex; flex-direction: column; padding: 2mm; box-sizing: border-box; }
    .name { font-size: 7pt; font-weight: bold; margin-bottom: 1mm; white-space: nowrap; overflow: hidden; }
    .biz  { font-size: 6pt; color: #555; margin-bottom: 1mm; }
    canvas { width: 100%; height: 12mm; }
    .footer { display: flex; justify-content: space-between; margin-top: 1mm; }
    .price { font-size: 9pt; font-weight: bold; }
    .sku   { font-size: 5pt; color: #666; }
  </style>
</head>
<body>
  ${label.businessName ? `<div class="biz">${escapeHtml(label.businessName)}</div>` : ''}
  <div class="name">${escapeHtml(label.itemName)}</div>
  <canvas id="bc"></canvas>
  <div class="footer">
    ${label.sku ? `<span class="sku">${escapeHtml(label.sku)}</span>` : '<span></span>'}
    <span class="price">${price}</span>
  </div>
  <script>
    JsBarcode('#bc', ${JSON.stringify(label.barcode).replace(/</g, '\\u003c')}, { format: 'CODE128', displayValue: true,
      fontSize: 7, height: 35, margin: 0, width: 1.2 });
    setTimeout(() => { window.print(); window.addEventListener('afterprint', () => window.close()); }, 400);
  <\/script>
</body>
</html>`.trim();

  const w = window.open('', '_blank', 'width=200,height=120');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

// ─── Star Micronics SDK ───────────────────────────────────────────────────────
// Supports: Star CloudPRNT, Star WebPRNT (mC-Print3, TSP100IV, TSP650II, etc.)
// Star printers expose a local HTTP server on the LAN.

export interface StarPrinterConfig {
  /** LAN IP or hostname of the Star printer, e.g. "192.168.1.100" */
  host: string;
  /** Port — Star WebPRNT default is 8008 */
  port?: number;
}

/**
 * Generate Star WebPRNT XML for a receipt.
 * Compatible with mC-Print3, TSP100IV, TSP650II running WebPRNT firmware.
 */
export function generateStarWebPRNT(receipt: ReceiptData): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const total = (receipt.totalCents / 100).toFixed(2);

  const itemLines = receipt.items.map((item) => `
    <line>
      <text width="2" height="1">${esc(item.name.substring(0, 22))}</text>
    </line>
    <line>
      <text>${item.quantity} x KES ${(item.unitPriceCents / 100).toFixed(2)}</text>
      <text align="right">KES ${(item.totalCents / 100).toFixed(2)}</text>
    </line>`).join('');

  const paymentLines = groupPayments(receipt.payments).map((group) => {
    if (group.isGroup) {
      return `
    <line><bold><text>${esc(group.label)}:</text></bold><bold><text align="right">KES ${(group.totalCents / 100).toFixed(2)}</text></bold></line>
    ${group.lines.map(p => `<line><text>  ${esc(p.method)}${p.reference ? ` (${esc(p.reference)})` : ''}</text><text align="right">KES ${(p.amountCents / 100).toFixed(2)}</text></line>`).join('')}`;
    }
    const p = group.lines[0];
    return `<line><text>${esc(group.label)}${p.reference ? ` (${esc(p.reference)})` : ''}</text><text align="right">KES ${(p.amountCents / 100).toFixed(2)}</text></line>`;
  }).join('');

  const kraSection = receipt.etimsSubmitted && receipt.etimsControlNumber ? `
    <line><text align="center">--- KRA eTIMS VERIFIED ---</text></line>
    <line><text align="center">Control: ${esc(receipt.etimsControlNumber)}</text></line>
    ${receipt.kraQRCode ? `<qrcode model="2" level="M" cell="4" align="center">${esc(receipt.kraQRCode)}</qrcode>` : ''}` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<starwebprnt>
  <body>
    <initialization/>
    <align value="center"/>
    <bold><text>${esc(receipt.businessName)}</text></bold>
    <text>${esc(receipt.storeName)}</text>
    ${receipt.storeAddress ? `<text>${esc(receipt.storeAddress)}</text>` : ''}
    ${receipt.storePhone ? `<text>${esc(receipt.storePhone)}</text>` : ''}
    <align value="left"/>
    <line><text>Receipt: ${esc(receipt.receiptNumber)}</text></line>
    <line><text>Date: ${new Date(receipt.date).toLocaleString('en-KE')}</text></line>
    <line><text>Cashier: ${esc(receipt.cashierName)}</text></line>
    ${receipt.customerName ? `<line><text>Customer: ${esc(receipt.customerName)}</text></line>` : ''}
    <line><text>--------------------------------</text></line>
    ${itemLines}
    <line><text>--------------------------------</text></line>
    <line>
      <text>Subtotal:</text>
      <text align="right">KES ${((receipt.subtotalCents - (receipt.vatCents ?? 0) - (receipt.totCents ?? 0)) / 100).toFixed(2)}</text>
    </line>
    ${receipt.vatCents ? `<line><text>VAT (16%):</text><text align="right">KES ${(receipt.vatCents / 100).toFixed(2)}</text></line>` : ''}
    ${receipt.totCents ? `<line><text>TOT (3%):</text><text align="right">KES ${(receipt.totCents / 100).toFixed(2)}</text></line>` : ''}
    <line>
      <bold><text>TOTAL:</text></bold>
      <bold><text align="right">KES ${total}</text></bold>
    </line>
    <line><text>--------------------------------</text></line>
    ${paymentLines}
    ${receipt.changeCents && receipt.changeCents > 0 ? `<line><text>CHANGE:</text><text align="right">KES ${(receipt.changeCents / 100).toFixed(2)}</text></line>` : ''}
    ${((receipt.pointsEarned ?? 0) > 0 || (receipt.loyaltyBalance ?? 0) > 0) ? `
    <line><text>================================</text></line>
    <align value="center"/>
    ${(receipt.pointsEarned ?? 0) > 0 ? `<bold><text>* +${receipt.pointsEarned} LOYALTY POINTS EARNED *</text></bold>` : ''}
    <text>Loyalty balance: ${(receipt.loyaltyBalance ?? 0).toLocaleString()} pts</text>
    <align value="left"/>
    <line><text>================================</text></line>` : ''}
    ${kraSection}
    <align value="center"/>
    <text>Thank you for your business!</text>
    <cut type="partial"/>
  </body>
</starwebprnt>`;
}

/**
 * Print a receipt to a Star printer via WebPRNT (LAN HTTP POST).
 * The printer must be on the same network and have WebPRNT enabled.
 */
export async function printToStarWebPRNT(
  config: StarPrinterConfig,
  receipt: ReceiptData,
): Promise<void> {
  const port = config.port ?? 8008;
  const xml = generateStarWebPRNT(receipt);
  const res = await fetch(`http://${config.host}:${port}/WebPRNT/SendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    body: xml,
  });
  if (!res.ok) throw new Error(`Star WebPRNT error: ${res.status} ${res.statusText}`);
}

/**
 * Print a KOT to a Star printer via WebPRNT.
 */
export async function printKOTToStar(config: StarPrinterConfig, kot: KOTData): Promise<void> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const itemLines = kot.items.map((item) => `
    <line>
      <bold><text width="2" height="2">${item.quantity}x ${esc(item.name)}</text></bold>
    </line>
    ${item.specialInstructions ? `<line><text>  !! ${esc(item.specialInstructions)}</text></line>` : ''}
    ${(item.modifiers ?? []).map((m) => `<line><text>  + ${esc(m)}</text></line>`).join('')}`).join('');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<starwebprnt>
  <body>
    <initialization/>
    <align value="center"/>
    <bold><text width="2" height="2">KITCHEN ORDER</text></bold>
    <bold><text width="3" height="3">T${esc(kot.tableNumber)}</text></bold>
    <text>${new Date(kot.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}${kot.waiterName ? ` · ${esc(kot.waiterName)}` : ''}${kot.kotNumber ? ` · KOT #${esc(kot.kotNumber)}` : ''}</text>
    <text>${kot.orderType === 'ADDITION' ? '+ ADDITION' : '* NEW ORDER'}</text>
    <align value="left"/>
    <line><text>================================</text></line>
    ${itemLines}
    <line><text>================================</text></line>
    <cut type="partial"/>
  </body>
</starwebprnt>`;

  const port = config.port ?? 8008;
  const res = await fetch(`http://${config.host}:${port}/WebPRNT/SendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    body: xml,
  });
  if (!res.ok) throw new Error(`Star KOT print error: ${res.status}`);
}

// ─── Epson ePOS SDK ───────────────────────────────────────────────────────────
// Supports: TM-T88VI, TM-T20III, TM-T82III, TM-m30II via ePOS-Print XML over HTTP.
// Epson printers expose a local SOAP/XML endpoint on port 80 at /cgi-bin/epos/service.cgi

export interface EpsonPrinterConfig {
  /** LAN IP or hostname of the Epson printer */
  host: string;
  /** Printer device ID — default "local_printer" */
  deviceId?: string;
}

/**
 * Generate Epson ePOS-Print XML for a receipt.
 * Compatible with TM-T88VI, TM-T20III, TM-T82III, TM-m30II.
 */
export function generateEpsonEPOS(receipt: ReceiptData): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const total = (receipt.totalCents / 100).toFixed(2);

  const itemLines = receipt.items.map((item) => `
      <text>${esc(item.name.substring(0, 24))}&#10;</text>
      <text>${item.quantity} x KES ${(item.unitPriceCents / 100).toFixed(2)}        KES ${(item.totalCents / 100).toFixed(2)}&#10;</text>`).join('');

  const paymentLines = groupPayments(receipt.payments).map((group) => {
    if (group.isGroup) {
      return `<text bold="true">${esc(group.label)}:        KES ${(group.totalCents / 100).toFixed(2)}&#10;</text>` +
        group.lines.map(p => `<text>  ${esc(p.method)}${p.reference ? ` (${esc(p.reference)})` : ''}  KES ${(p.amountCents / 100).toFixed(2)}&#10;</text>`).join('');
    }
    const p = group.lines[0];
    return `<text>${esc(group.label)}${p.reference ? ` (${esc(p.reference)})` : ''}        KES ${(p.amountCents / 100).toFixed(2)}&#10;</text>`;
  }).join('');

  const kraSection = receipt.etimsSubmitted && receipt.etimsControlNumber
    ? `<text align="center">--- KRA eTIMS VERIFIED ---&#10;</text>
       <text align="center">Control: ${esc(receipt.etimsControlNumber)}&#10;</text>
       ${receipt.kraQRCode ? `<symbol type="qrcode_model_2" level="level_m" width="4" align="center">${esc(receipt.kraQRCode)}</symbol>` : ''}`
    : '';

  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
      <initialize/>
      <text align="center" font="font_a" width="2" height="2" bold="true">${esc(receipt.businessName)}&#10;</text>
      <text align="center">${esc(receipt.storeName)}&#10;</text>
      ${receipt.storeAddress ? `<text align="center">${esc(receipt.storeAddress)}&#10;</text>` : ''}
      ${receipt.storePhone ? `<text align="center">${esc(receipt.storePhone)}&#10;</text>` : ''}
      <text align="left">Receipt: ${esc(receipt.receiptNumber)}&#10;</text>
      <text>Date: ${new Date(receipt.date).toLocaleString('en-KE')}&#10;</text>
      <text>Cashier: ${esc(receipt.cashierName)}&#10;</text>
      ${receipt.customerName ? `<text>Customer: ${esc(receipt.customerName)}&#10;</text>` : ''}
      <text>--------------------------------&#10;</text>
      ${itemLines}
      <text>--------------------------------&#10;</text>
      <text>Subtotal:        KES ${((receipt.subtotalCents - (receipt.vatCents ?? 0) - (receipt.totCents ?? 0)) / 100).toFixed(2)}&#10;</text>
      ${receipt.vatCents ? `<text>VAT (16%):       KES ${(receipt.vatCents / 100).toFixed(2)}&#10;</text>` : ''}
      ${receipt.totCents ? `<text>TOT (3%):        KES ${(receipt.totCents / 100).toFixed(2)}&#10;</text>` : ''}
      <text bold="true" width="2" height="1">TOTAL:           KES ${total}&#10;</text>
      <text>--------------------------------&#10;</text>
      ${paymentLines}
      ${receipt.changeCents && receipt.changeCents > 0 ? `<text bold="true">CHANGE:          KES ${(receipt.changeCents / 100).toFixed(2)}&#10;</text>` : ''}
      ${((receipt.pointsEarned ?? 0) > 0 || (receipt.loyaltyBalance ?? 0) > 0) ? `<text>================================&#10;</text>${(receipt.pointsEarned ?? 0) > 0 ? `<text align="center" bold="true" width="2" height="1">+${receipt.pointsEarned} POINTS EARNED&#10;</text>` : ''}<text align="center">Loyalty balance: ${(receipt.loyaltyBalance ?? 0).toLocaleString()} pts&#10;</text><text>================================&#10;</text>` : ''}
      ${kraSection}
      <text align="center">Thank you for your business!&#10;</text>
      <cut type="part"/>
    </epos-print>
  </s:Body>
</s:Envelope>`;
}

/**
 * Print a receipt to an Epson printer via ePOS-Print XML (LAN HTTP POST).
 */
export async function printToEpsonEPOS(
  config: EpsonPrinterConfig,
  receipt: ReceiptData,
): Promise<void> {
  const deviceId = config.deviceId ?? 'local_printer';
  const xml = generateEpsonEPOS(receipt);
  const res = await fetch(`http://${config.host}/cgi-bin/epos/service.cgi?devid=${deviceId}&timeout=10000`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '""',
    },
    body: xml,
  });
  if (!res.ok) throw new Error(`Epson ePOS error: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (text.includes('SchemaError') || text.includes('DeviceNotFound')) {
    throw new Error(`Epson ePOS rejected request: ${text.substring(0, 200)}`);
  }
}

/**
 * Print a KOT to an Epson printer via ePOS-Print XML.
 */
export async function printKOTToEpson(config: EpsonPrinterConfig, kot: KOTData): Promise<void> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const deviceId = config.deviceId ?? 'local_printer';

  const itemLines = kot.items.map((item) => `
      <text bold="true" width="2" height="2">${item.quantity}x ${esc(item.name)}&#10;</text>
      ${item.specialInstructions ? `<text>  !! ${esc(item.specialInstructions)}&#10;</text>` : ''}
      ${(item.modifiers ?? []).map((m) => `<text>  + ${esc(m)}&#10;</text>`).join('')}`).join('');

  const xml = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
      <initialize/>
      <text align="center" bold="true" width="2" height="2">KITCHEN ORDER&#10;</text>
      <text align="center" bold="true" width="3" height="3">T${esc(kot.tableNumber)}&#10;</text>
      <text align="center">${new Date(kot.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}${kot.waiterName ? ` · ${esc(kot.waiterName)}` : ''}${kot.kotNumber ? ` · KOT #${esc(kot.kotNumber)}` : ''}&#10;</text>
      <text align="center">${kot.orderType === 'ADDITION' ? '+ ADDITION' : '* NEW ORDER'}&#10;</text>
      <text align="left">================================&#10;</text>
      ${itemLines}
      <text>================================&#10;</text>
      <cut type="part"/>
    </epos-print>
  </s:Body>
</s:Envelope>`;

  const res = await fetch(`http://${config.host}/cgi-bin/epos/service.cgi?devid=${deviceId}&timeout=10000`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body: xml,
  });
  if (!res.ok) throw new Error(`Epson KOT print error: ${res.status}`);
}

// ─── KOT Direct Print (unified) ───────────────────────────────────────────────

export type KOTPrinterType = 'STAR' | 'EPSON' | 'NETWORK_ESCPOS' | 'BROWSER';

export interface KOTPrinterConfig {
  type: KOTPrinterType;
  /** For STAR / EPSON: LAN IP of the printer */
  host?: string;
  /** For STAR: port (default 8008) */
  port?: number;
  /** For EPSON: device ID (default "local_printer") */
  deviceId?: string;
  /** For NETWORK_ESCPOS: printer ID registered in the API */
  networkPrinterId?: string;
}

/**
 * Print a KOT directly to a hardware printer.
 * Falls back to browser popup if type is BROWSER or on any error.
 */
export async function printKOTDirect(config: KOTPrinterConfig, kot: KOTData): Promise<void> {
  try {
    if (config.type === 'STAR' && config.host) {
      await printKOTToStar({ host: config.host, port: config.port }, kot);
      return;
    }
    if (config.type === 'EPSON' && config.host) {
      await printKOTToEpson({ host: config.host, deviceId: config.deviceId }, kot);
      return;
    }
    if (config.type === 'NETWORK_ESCPOS' && config.networkPrinterId) {
      // Build ESC/POS KOT bytes and send via API proxy
      await api.post(`/printers/${config.networkPrinterId}/print`, {
        data: bytesToBase64(encodeEscPos(buildKOTEscPos(kot))),
      });
      return;
    }
  } catch (err) {
    console.warn('KOT direct print failed, falling back to browser:', err);
  }
  // Fallback: browser popup
  printKOT(kot);
}

/** Build raw ESC/POS bytes for a KOT (for network/USB ESC/POS printers). */
function buildKOTEscPos(kot: KOTData, paperWidth: PaperWidth = getPaperWidth() ?? 58): string {
  const rule = '='.repeat(PAPER_COLUMNS[paperWidth]);
  let out = ESCPOS.INIT;
  out += ESCPOS.ALIGN_CENTER + ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
  out += 'KITCHEN ORDER' + ESCPOS.FEED;
  out += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
  out += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
  out += `T${asciiSafe(kot.tableNumber)}` + ESCPOS.FEED;
  out += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
  out += asciiSafe(new Date(kot.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }));
  if (kot.waiterName) out += ` - ${asciiSafe(kot.waiterName)}`;
  if (kot.kotNumber) out += ` - KOT #${asciiSafe(kot.kotNumber)}`;
  out += ESCPOS.FEED;
  out += (kot.orderType === 'ADDITION' ? '+ ADDITION' : '* NEW ORDER') + ESCPOS.FEED;
  out += ESCPOS.ALIGN_LEFT;
  out += rule + ESCPOS.FEED;
  for (const item of kot.items) {
    out += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
    out += `${item.quantity}x ${asciiSafe(item.name)}` + ESCPOS.FEED;
    out += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
    if (item.specialInstructions) out += `  !! ${asciiSafe(item.specialInstructions)}` + ESCPOS.FEED;
    for (const mod of item.modifiers ?? []) out += `  + ${asciiSafe(mod)}` + ESCPOS.FEED;
  }
  out += rule + ESCPOS.FEED + ESCPOS.FEED;
  out += ESCPOS.CUT;
  return out;
}
