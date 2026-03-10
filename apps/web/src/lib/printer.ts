// ESC/POS Receipt Template Engine
// Generates thermal printer commands and browser-printable HTML

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
  kraQRCode?: string;
  kraControlNumber?: string;
  etimsSubmitted?: boolean;
  notes?: string;
  saleId?: string;
  receiptHeader?: string;
  receiptFooter?: string;
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
};

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (text.length >= width) return text.substring(0, width);
  const padding = ' '.repeat(width - text.length);
  return align === 'left' ? text + padding : padding + text;
}

function line(char: string = '-', width: number = 32): string {
  return char.repeat(width);
}

// Generate ESC/POS commands for thermal printer
export function generateESCPOS(receipt: ReceiptData): string {
  let output = ESCPOS.INIT;

  // Pending KRA watermark
  if (receipt.etimsSubmitted === false) {
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
  output += line('=', 32) + ESCPOS.FEED;
  output += `Receipt: ${receipt.receiptNumber}` + ESCPOS.FEED;
  output += `Date: ${new Date(receipt.date).toLocaleString('en-KE')}` + ESCPOS.FEED;
  output += `Cashier: ${receipt.cashierName}` + ESCPOS.FEED;
  if (receipt.customerName) {
    output += `Customer: ${receipt.customerName}` + ESCPOS.FEED;
  }
  output += line('=', 32) + ESCPOS.FEED;
  output += ESCPOS.FEED;

  // Items
  output += ESCPOS.FONT_NORMAL;
  receipt.items.forEach((item) => {
    const itemName = item.name.substring(0, 20);
    output += itemName + ESCPOS.FEED;
    
    const qtyPrice = `${item.quantity} x ${formatKES(item.unitPriceCents)}`;
    const total = formatKES(item.totalCents);
    output += pad(qtyPrice, 20) + pad(total, 12, 'right') + ESCPOS.FEED;
    
    if (item.discountPercent && item.discountPercent > 0) {
      output += `  Discount: -${item.discountPercent}%` + ESCPOS.FEED;
    }
  });

  // Totals
  const taxCents = (receipt.vatCents ?? 0) + (receipt.totCents ?? 0);
  const subtotalLabel = receipt.vatCents && receipt.vatCents > 0 ? 'Subtotal(ex-VAT):' : receipt.totCents && receipt.totCents > 0 ? 'Subtotal(ex-TOT):' : 'Subtotal:';
  output += ESCPOS.FEED + line('-', 32) + ESCPOS.FEED;
  output += pad(subtotalLabel, 20) + pad(formatKES(receipt.subtotalCents - taxCents), 12, 'right') + ESCPOS.FEED;

  if (receipt.serviceChargeCents && receipt.serviceChargeCents > 0) {
    output += pad('Service (10%):', 20) + pad(formatKES(receipt.serviceChargeCents), 12, 'right') + ESCPOS.FEED;
  }

  if (receipt.vatCents && receipt.vatCents > 0) {
    output += pad('VAT (16%):', 20) + pad(formatKES(receipt.vatCents), 12, 'right') + ESCPOS.FEED;
  }

  if (receipt.totCents && receipt.totCents > 0) {
    output += pad('TOT (3%):', 20) + pad(formatKES(receipt.totCents), 12, 'right') + ESCPOS.FEED;
  }
  
  output += line('-', 32) + ESCPOS.FEED;
  output += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
  output += pad('TOTAL:', 20) + pad(formatKES(receipt.totalCents), 12, 'right') + ESCPOS.FEED;
  output += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
  output += line('-', 32) + ESCPOS.FEED;

  // Payments
  output += ESCPOS.FEED;
  receipt.payments.forEach((payment) => {
    const method = payment.reference ? `${payment.method} (${payment.reference})` : payment.method;
    output += pad(method, 20) + pad(formatKES(payment.amountCents), 12, 'right') + ESCPOS.FEED;
  });
  
  if (receipt.changeCents && receipt.changeCents > 0) {
    output += ESCPOS.BOLD_ON;
    output += pad('CHANGE:', 20) + pad(formatKES(receipt.changeCents), 12, 'right') + ESCPOS.FEED;
    output += ESCPOS.BOLD_OFF;
  }

  // KRA Info
  if (receipt.kraControlNumber) {
    output += ESCPOS.FEED + line('=', 32) + ESCPOS.FEED;
    output += ESCPOS.ALIGN_CENTER;
    output += `KRA Control: ${receipt.kraControlNumber}` + ESCPOS.FEED;
    if (receipt.kraQRCode) {
      output += '[QR CODE]' + ESCPOS.FEED; // TODO: Actual QR code printing
    }
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
export function generateHTML(receipt: ReceiptData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt ${receipt.receiptNumber}</title>
  <style>
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 0; }
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      max-width: 80mm;
      margin: 0 auto;
      padding: 10mm;
    }
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
  </style>
</head>
<body>
  ${receipt.etimsSubmitted === false ? `<div class="pending-watermark">⚠ PENDING KRA SUBMISSION</div>` : ''}
  <div class="center bold large">${receipt.businessName}</div>
  <div class="center">${receipt.storeName}</div>
  ${receipt.storeAddress ? `<div class="center small">${receipt.storeAddress}</div>` : ''}
  ${receipt.storePhone ? `<div class="center small">${receipt.storePhone}</div>` : ''}
  
  <div class="line"></div>
  
  <table class="small">
    <tr><td>Receipt:</td><td class="right bold">${receipt.receiptNumber}</td></tr>
    <tr><td>Date:</td><td class="right">${new Date(receipt.date).toLocaleString('en-KE')}</td></tr>
    <tr><td>Cashier:</td><td class="right">${receipt.cashierName}</td></tr>
    ${receipt.customerName ? `<tr><td>Customer:</td><td class="right">${receipt.customerName}</td></tr>` : ''}
  </table>
  
  <div class="line"></div>
  
  ${receipt.items.map(item => `
    <div>
      <div class="bold">${item.name}</div>
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
    <tr class="bold large"><td>TOTAL:</td><td class="right">${formatKES(receipt.totalCents)}</td></tr>
  </table>
  
  <div class="line"></div>
  
  <table class="small">
    ${receipt.payments.map(p => `
      <tr>
        <td>${p.method}${p.reference ? ` (${p.reference})` : ''}</td>
        <td class="right">${formatKES(p.amountCents)}</td>
      </tr>
    `).join('')}
    ${receipt.changeCents && receipt.changeCents > 0 ? `<tr class="bold"><td>CHANGE:</td><td class="right">${formatKES(receipt.changeCents)}</td></tr>` : ''}
  </table>
  
  ${receipt.kraControlNumber ? `
    <div class="line"></div>
    <div class="center small">
      <div>KRA Control: ${receipt.kraControlNumber}</div>
      ${receipt.kraQRCode ? '<div>[QR CODE]</div>' : ''}
    </div>
  ` : ''}
  
  <div class="line"></div>
  ${receipt.receiptHeader ? `<div class="center small" style="margin-bottom:4px">${receipt.receiptHeader}</div>` : ''}
  <div class="center small">
    <div>Thank you for your business!</div>
    ${receipt.receiptFooter ? `<div style="margin-top:4px">${receipt.receiptFooter}</div>` : ''}
    <div style="margin-top:4px;color:#888">Powered by: Kastra Systems</div>
  </div>
</body>
</html>
  `.trim();
}

// Print to browser
export function printToBrowser(receipt: ReceiptData): void {
  const html = generateHTML(receipt);
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Wait for content to render, then print.
    // Use afterprint event to close the window AFTER the dialog is dismissed
    // (window.print() is async in Firefox — closing immediately kills the dialog)
    setTimeout(() => {
      printWindow.addEventListener('afterprint', () => {
        printWindow.close();
      });
      printWindow.print();
    }, 500);
  }
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
}

export function generateBillHTML(bill: BillData): string {
  // VAT is inclusive — extract from total (16/116)
  const vatCents = Math.round(bill.totalCents * 16 / 116);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill — Table ${bill.tableNumber}</title>
  <style>
    @media print { @page { margin: 0; size: 80mm auto; } body { margin: 0; } }
    body { font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5;
           max-width: 80mm; margin: 0 auto; padding: 8mm; }
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
  <div class="bill-header">★ BILL</div>
  <div class="center bold large">${bill.businessName}</div>
  <div class="center xl">Table ${bill.tableNumber}</div>
  <div class="center small">${new Date(bill.date).toLocaleString('en-KE')}${bill.waiterName ? ` · Served by: ${bill.waiterName}` : ''}</div>
  <div class="line"></div>
  ${bill.items.map((item) => `
    <div style="margin-bottom:4px">
      <div class="bold">${item.name}</div>
      <div class="row small"><span>${item.quantity} × KES ${(item.unitPriceCents / 100).toFixed(2)}</span><span class="bold">KES ${(item.totalCents / 100).toFixed(2)}</span></div>
    </div>
  `).join('')}
  <div class="line"></div>
  <div class="row bold large" style="margin-bottom:4px"><span>TOTAL (VAT incl.):</span><span>KES ${(bill.totalCents / 100).toFixed(2)}</span></div>
  <div class="row small muted"><span>  VAT (16%) included:</span><span>KES ${(vatCents / 100).toFixed(2)}</span></div>
  <div class="line"></div>
  ${bill.footer ? `<div class="center small" style="margin-top:6px">${bill.footer}</div>` : ''}
  <div class="center small" style="margin-top:6px">Please check your bill and inform staff of any errors.</div>
  <div class="center small">Thank you for dining with us!</div>
  <div class="center small muted" style="margin-top:8px">Powered by: Kastra Systems</div>
</body>
</html>`.trim();
}

export function printBill(bill: BillData): void {
  const html = generateBillHTML(bill);
  const w = window.open('', '_blank', 'width=320,height=560');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.addEventListener('afterprint', () => w.close());
      w.print();
    }, 400);
  }
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

/**
 * Print KOT with printer routing: split items by destination printer handle.
 * Items without a matching printer handle go to the first available KOT printer,
 * or fall back to browser print if no printers are configured.
 */
export function printKOTWithRouting(
  kot: KOTData,
  printers: Array<{ handles: string[]; connectionType: string; connectionDetails: string }>,
): void {
  // Group items by routing handle
  const groups: Record<string, typeof kot.items> = {};
  for (const item of kot.items) {
    const handle = categorizeKOTItem(item.name, item.category);
    if (!groups[handle]) groups[handle] = [];
    groups[handle].push(item);
  }

  // Find which printers service which handles
  const printed = new Set<string>();
  for (const [handle, items] of Object.entries(groups)) {
    const printer = printers.find((p) => p.handles.includes(handle));
    const kotSlice: KOTData = { ...kot, items };
    // Print to browser regardless (real hardware routing would need native bridge)
    printKOT(kotSlice);
    if (printer) printed.add(handle);
  }

  // If nothing was routed, print whole KOT
  if (Object.keys(groups).length === 0) {
    printKOT(kot);
  }
}

export function generateKOTHTML(kot: KOTData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>KOT T${kot.tableNumber}</title>
  <style>
    @media print { @page { margin: 0; size: 80mm auto; } body { margin: 0; } }
    body { font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.6;
           max-width: 80mm; margin: 0 auto; padding: 8mm; }
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
  <div class="table">T${kot.tableNumber}</div>
  <div class="meta">${new Date(kot.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}${kot.waiterName ? ` · ${kot.waiterName}` : ''}${kot.kotNumber ? ` · KOT #${kot.kotNumber}` : ''}</div>
  <div class="type-wrap"><span class="type-badge">${kot.orderType === 'ADDITION' ? '+ ADDITION' : '★ NEW ORDER'}</span></div>
  <div class="line"></div>
  ${kot.items.map((item) => `
    <div class="item"><span class="qty">${item.quantity}×</span><span class="item-name">${item.name}</span></div>
    ${item.specialInstructions ? `<div class="note">⚠ ${item.specialInstructions}</div>` : ''}
    ${(item.modifiers ?? []).map((m) => `<div class="mod">• ${m}</div>`).join('')}
  `).join('')}
  <div class="line"></div>
</body>
</html>`.trim();
}

export function printKOT(kot: KOTData): void {
  const html = generateKOTHTML(kot);
  const w = window.open('', '_blank', 'width=320,height=480');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.addEventListener('afterprint', () => w.close());
      w.print();
    }, 300);
  }
}

// Print to Network/LAN thermal printer via API proxy
export async function printToNetwork(printerId: string, receipt: ReceiptData): Promise<void> {
  const escpos = generateESCPOS(receipt);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(escpos);
  // Convert to base64
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  const base64 = btoa(binary);

  const response = await fetch(`/api/v1/printers/${printerId}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: base64 }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.message ?? 'Network printer error');
  }
}

// Print to USB thermal printer (WebUSB)
export async function printToUSB(receipt: ReceiptData): Promise<void> {
  if (!('usb' in navigator)) {
    throw new Error('WebUSB not supported in this browser');
  }

  try {
    const device = await (navigator as any).usb.requestDevice({
      filters: [{ classCode: 7 }] // Printer class
    });

    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);

    const escpos = generateESCPOS(receipt);
    const encoder = new TextEncoder();
    const data = encoder.encode(escpos);

    await device.transferOut(1, data);
    await device.close();
  } catch (error) {
    console.error('USB print error:', error);
    throw new Error('Failed to print to USB printer');
  }
}

// Print to Bluetooth thermal printer
export async function printToBluetooth(receipt: ReceiptData): Promise<void> {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth not supported in this browser');
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }]
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

    const escpos = generateESCPOS(receipt);
    const encoder = new TextEncoder();
    const data = encoder.encode(escpos);

    await characteristic.writeValue(data);
  } catch (error) {
    console.error('Bluetooth print error:', error);
    throw new Error('Failed to print to Bluetooth printer');
  }
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
  <title>Label ${label.barcode}</title>
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
  ${label.businessName ? `<div class="biz">${label.businessName}</div>` : ''}
  <div class="name">${label.itemName}</div>
  <canvas id="bc"></canvas>
  <div class="footer">
    ${label.sku ? `<span class="sku">${label.sku}</span>` : '<span></span>'}
    <span class="price">${price}</span>
  </div>
  <script>
    JsBarcode('#bc', '${label.barcode}', { format: 'CODE128', displayValue: true,
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
