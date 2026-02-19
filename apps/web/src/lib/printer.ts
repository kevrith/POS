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
  notes?: string;
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
  output += ESCPOS.FEED + line('-', 32) + ESCPOS.FEED;
  output += pad('Subtotal:', 20) + pad(formatKES(receipt.subtotalCents), 12, 'right') + ESCPOS.FEED;
  
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
  output += 'Thank you for your business!' + ESCPOS.FEED;
  output += 'Powered by Universal POS' + ESCPOS.FEED;
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
  </style>
</head>
<body>
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
    <tr><td>Subtotal:</td><td class="right">${formatKES(receipt.subtotalCents)}</td></tr>
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
  <div class="center small">
    <div>Thank you for your business!</div>
    <div>Powered by Universal POS</div>
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
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
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
