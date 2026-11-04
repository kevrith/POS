/**
 * Pure printing logic: ESC/POS layout for 58 mm and 80 mm paper, settings
 * validation and dispatch. Native transports are faked, so no device is needed.
 */
import { asciiSafe, buildReceiptBytes, bytesToBase64, PAPER_COLUMNS, row, wrapText } from '../lib/escpos';
import { configProblem, DEFAULT_PRINTER_SETTINGS, isValidHost, normalizeSettings, type PrinterSettings } from '../lib/printerConfig';
import { dispatchPrint, type PrintTransports } from '../lib/printDispatch';
import { receiptHtml } from '../lib/receiptHtml';
import { buildTestReceipt, type PrintableReceipt } from '../lib/receiptModel';

/** Printed lines only: split on LF after removing ESC/GS commands that carry text-free parameters. */
function printedLines(bytes: Uint8Array): string[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) { i += bytes[i + 1] === 0x40 ? 1 : 2; continue; } // ESC @ | ESC x n
    if (b === 0x1d) { i += 3; continue; }                              // GS V A 0 (cut)
    out.push(b);
  }
  return Buffer.from(out).toString('latin1').split('\n');
}

const receipt: PrintableReceipt = {
  businessName: 'Premier Cafe & Restaurant Nairobi Branch',
  receiptNumber: 'NRB01-000123',
  dateISO: '2026-10-27T10:15:00.000Z',
  lines: [
    { name: 'Cappuccino large with extra shot and oat milk', quantity: 2, unitPriceCents: 35000 },
    { name: 'Espresso', quantity: 1, unitPriceCents: 25000 },
  ],
  subtotalCents: 86207,
  taxLabel: 'VAT (16%)',
  taxCents: 13793,
  totalCents: 100000,
  paymentMethod: 'CASH',
  changeCents: 50000,
};

describe('paper widths', () => {
  it('maps 58 mm to 32 columns and 80 mm to 48', () => {
    expect(PAPER_COLUMNS[58]).toBe(32);
    expect(PAPER_COLUMNS[80]).toBe(48);
  });

  it.each([58, 80] as const)('no printed line exceeds the %i mm column count', (w) => {
    const lines = printedLines(buildReceiptBytes(receipt, w));
    const widest = Math.max(...lines.map((l) => l.length));
    expect(widest).toBeLessThanOrEqual(PAPER_COLUMNS[w]);
  });

  it('uses the full width of an 80 mm roll', () => {
    const lines = printedLines(buildReceiptBytes(receipt, 80));
    expect(lines.some((l) => l === '-'.repeat(48))).toBe(true);
    const narrow = printedLines(buildReceiptBytes(receipt, 58));
    expect(narrow.some((l) => l === '-'.repeat(32))).toBe(true);
    expect(narrow.some((l) => l.length > 32)).toBe(false);
  });

  it('wraps a long item name across lines instead of cutting it', () => {
    const text = printedLines(buildReceiptBytes(receipt, 58)).join('|');
    expect(text).toContain('Cappuccino large with extra shot');
    expect(text).toContain('and oat milk');
  });

  it('fits the name on fewer lines on the wider roll', () => {
    const lines58 = printedLines(buildReceiptBytes(receipt, 58)).length;
    const lines80 = printedLines(buildReceiptBytes(receipt, 80)).length;
    expect(lines80).toBeLessThan(lines58);
  });
});

describe('amounts', () => {
  it.each([58, 80] as const)('never truncates a large total on %i mm', (w) => {
    const big = { ...receipt, totalCents: 123456789, subtotalCents: 123456789 };
    const text = printedLines(buildReceiptBytes(big, w)).join('\n');
    expect(text).toContain('KES 1,234,567.89');
  });

  it('keeps the amount and shortens the label when they collide', () => {
    const line = row('A very long label that cannot fit', 'KES 1,234,567.89', 32);
    expect(line.length).toBe(32);
    expect(line.endsWith('KES 1,234,567.89')).toBe(true);
  });
});

describe('bytes', () => {
  it('starts with ESC @ and ends with the cut command', () => {
    const b = buildReceiptBytes(receipt, 58);
    expect(Array.from(b.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(b.slice(-4))).toEqual([0x1d, 0x56, 0x41, 0x00]);
  });

  it('emits only 7-bit bytes, so no command can be corrupted by multi-byte encoding', () => {
    const odd = { ...receipt, businessName: 'Café — Première Ñandú \u{1F600}', lines: [{ name: 'Mandazi × 2', quantity: 1, unitPriceCents: 1000 }] };
    expect(Math.max(...buildReceiptBytes(odd, 80))).toBeLessThan(0x80);
    const text = printedLines(buildReceiptBytes(odd, 80)).join('|');
    expect(text).toContain('Cafe - Premiere Nandu ?');
    expect(text).toContain('Mandazi x 2');
  });

  it('base64 matches Node for every remainder length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255]) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 37) & 0xff);
      expect(bytesToBase64(data)).toBe(Buffer.from(data).toString('base64'));
    }
  });

  it('asciiSafe and wrapText behave on edge cases', () => {
    expect(asciiSafe('2:30 pm')).toBe('2:30 pm');
    expect(wrapText('', 10)).toEqual(['']);
    expect(wrapText('abcdefghijklmnopqrstuvwxyz', 10)).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz']);
  });
});

describe('settings', () => {
  it('is off, 58 mm and system dialog by default', () => {
    expect(DEFAULT_PRINTER_SETTINGS).toMatchObject({ enabled: false, method: 'system', paperWidth: 58, autoPrint: false });
  });

  it('falls back to defaults for garbage and keeps valid values', () => {
    expect(normalizeSettings(null)).toEqual({ ...DEFAULT_PRINTER_SETTINGS, bluetooth: undefined, network: undefined });
    const s = normalizeSettings({ enabled: true, method: 'network', paperWidth: 80, autoPrint: true, network: { host: '192.168.1.50', port: 9101 } });
    expect(s).toMatchObject({ enabled: true, method: 'network', paperWidth: 80, autoPrint: true, network: { host: '192.168.1.50', port: 9101 } });
    expect(normalizeSettings({ method: 'fax', paperWidth: 72 })).toMatchObject({ method: 'system', paperWidth: 58 });
    expect(normalizeSettings({ network: { host: 'not a host!', port: 9100 } }).network).toBeUndefined();
    expect(normalizeSettings({ network: { host: '10.0.0.5', port: 99999 } }).network?.port).toBe(9100);
  });

  it('validates hosts', () => {
    expect(['192.168.1.50', 'printer.local', 'epson-1'].every(isValidHost)).toBe(true);
    expect(['', '300.1.1.1', 'a b', 'http://x'].some(isValidHost)).toBe(false);
  });

  it('explains what is missing', () => {
    const base: PrinterSettings = { ...DEFAULT_PRINTER_SETTINGS, enabled: true };
    expect(configProblem({ ...base, method: 'bluetooth' })).toMatch(/Bluetooth printer/);
    expect(configProblem({ ...base, method: 'network' })).toMatch(/address/);
    expect(configProblem({ ...base, method: 'system' })).toBeNull();
  });
});

describe('dispatchPrint', () => {
  const fakes = () => {
    const t = {
      sendBluetooth: jest.fn().mockResolvedValue(undefined),
      sendNetwork: jest.fn().mockResolvedValue(undefined),
      printSystem: jest.fn().mockResolvedValue(undefined),
    };
    return { t, transports: t as PrintTransports };
  };
  const on = (patch: Partial<PrinterSettings>): PrinterSettings => ({ ...DEFAULT_PRINTER_SETTINGS, enabled: true, ...patch });

  it('sends 58 mm bytes to the chosen Bluetooth printer', async () => {
    const { t, transports } = fakes();
    await dispatchPrint(on({ method: 'bluetooth', paperWidth: 58, bluetooth: { address: 'AA:BB', name: 'MTP-II' } }), receipt, transports);
    expect(t.sendBluetooth).toHaveBeenCalledTimes(1);
    const [address, bytes] = t.sendBluetooth.mock.calls[0];
    expect(address).toBe('AA:BB');
    expect(Math.max(...printedLines(bytes).map((l: string) => l.length))).toBeLessThanOrEqual(32);
  });

  it('sends 80 mm bytes to the LAN printer on its port', async () => {
    const { t, transports } = fakes();
    await dispatchPrint(on({ method: 'network', paperWidth: 80, network: { host: '192.168.1.50', port: 9101 } }), receipt, transports);
    const [host, port, bytes] = t.sendNetwork.mock.calls[0];
    expect([host, port]).toEqual(['192.168.1.50', 9101]);
    expect(printedLines(bytes).some((l: string) => l === '-'.repeat(48))).toBe(true);
  });

  it('passes the paper width to the system dialog', async () => {
    const { t, transports } = fakes();
    await dispatchPrint(on({ method: 'system', paperWidth: 80 }), receipt, transports);
    expect(t.printSystem).toHaveBeenCalledWith(receipt, 80);
  });

  it('refuses with a readable reason when the printer was never chosen', async () => {
    const { t, transports } = fakes();
    await expect(dispatchPrint(on({ method: 'bluetooth' }), receipt, transports)).rejects.toThrow(/Choose a Bluetooth printer/);
    await expect(dispatchPrint(on({ method: 'network' }), receipt, transports)).rejects.toThrow(/printer address/);
    expect(t.sendBluetooth).not.toHaveBeenCalled();
    expect(t.sendNetwork).not.toHaveBeenCalled();
  });

  it('propagates a transport failure so the screen can show it', async () => {
    const { t, transports } = fakes();
    t.sendNetwork.mockRejectedValue(new Error('Could not reach the printer at 10.0.0.9:9100.'));
    await expect(dispatchPrint(on({ method: 'network', network: { host: '10.0.0.9', port: 9100 } }), receipt, transports)).rejects.toThrow(/10\.0\.0\.9/);
  });
});

describe('receiptHtml', () => {
  it('sizes the page to the paper and escapes user text', () => {
    expect(receiptHtml(receipt, 58)).toContain('width: 58mm');
    expect(receiptHtml(receipt, 80)).toContain('width: 80mm');
    const html = receiptHtml({ ...receipt, businessName: '<img src=x onerror=alert(1)>' }, 58);
    expect(html).not.toContain('<img src=x');
  });

  it('builds a test receipt that prints on both widths', () => {
    for (const w of [58, 80] as const) {
      expect(Math.max(...printedLines(buildReceiptBytes(buildTestReceipt('Shop'), w)).map((l) => l.length))).toBeLessThanOrEqual(PAPER_COLUMNS[w]);
    }
  });
});

describe('KRA eTIMS and fiscal status on mobile receipts', () => {
  const sale: PrintableReceipt = {
    businessName: 'Premier Cafe',
    receiptNumber: 'NRB01-000200',
    dateISO: '2026-10-27T10:15:00',
    lines: [{ name: 'Espresso', quantity: 1, unitPriceCents: 25000 }],
    subtotalCents: 21552,
    taxLabel: 'VAT (16%)',
    taxCents: 3448,
    totalCents: 25000,
    paymentMethod: 'CASH',
    cashierName: 'Amina',
  };
  const text = (r: PrintableReceipt) => printedLines(buildReceiptBytes(r, 58)).join('\n');

  it('prints the control number and the printer-native QR once KRA has accepted the sale', () => {
    const bytes = buildReceiptBytes({ ...sale, etimsSubmitted: true, etimsControlNumber: 'CU-77', kraQRCode: 'https://etims.kra.go.ke/v?x=1' }, 58);
    const out = printedLines(bytes).join('\n');
    expect(out).toContain('KRA eTIMS VERIFIED');
    expect(out).toContain('CU-77');
    expect(Buffer.from(bytes).includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(true);
  });

  it('a test-mode sale prints TEST MODE, with no VERIFIED, control number or QR', () => {
    const r: PrintableReceipt = { ...sale, etimsSubmitted: true, etimsTestMode: true, etimsControlNumber: 'ETM1793816051123', kraQRCode: 'ETM1793816051123' };
    const bytes = buildReceiptBytes(r, 58);
    const out = printedLines(bytes).join('\n');
    expect(out).toContain('TEST MODE');
    expect(out).not.toContain('VERIFIED');
    expect(out).not.toContain('ETM1793816051123');
    expect(Buffer.from(bytes).includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(false);
  });

  it('flags a sale KRA has not accepted yet as PENDING, never as verified', () => {
    const out = text({ ...sale, etimsSubmitted: false });
    expect(out).toContain('PENDING KRA SUBMISSION');
    expect(out).not.toContain('VERIFIED');
  });

  it('marks a reprint as a copy and a void as void', () => {
    expect(text({ ...sale, copyNumber: 1 })).toContain('COPY 1');
    expect(text({ ...sale, voided: true })).toContain('VOID');
    expect(text(sale)).not.toMatch(/COPY|VOID/);
  });

  it('shows the cashier and keeps subtotal + VAT = total', () => {
    const out = text(sale);
    expect(out).toContain('Cashier:');
    expect(out).toContain('215.52');
    expect(out).toContain('34.48');
    expect(out).toContain('KES 250.00');
  });

  it('the OS print sheet carries the same banners and an offline QR', () => {
    const html = receiptHtml({ ...sale, etimsSubmitted: true, etimsControlNumber: 'CU-77', kraQRCode: 'https://etims.kra.go.ke/v?x=1', copyNumber: 2 }, 80);
    expect(html).toContain('COPY 2');
    expect(html).toContain('CU-77');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/<script/i);
  });
});
