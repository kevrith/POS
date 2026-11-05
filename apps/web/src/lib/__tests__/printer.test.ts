import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KOTData, ReceiptData } from '../printer';

const printHtml = vi.fn();
const printRawNetwork = vi.fn();
const printRawUSB = vi.fn();
const printRawBluetooth = vi.fn();
const printRawToSystemPrinter = vi.fn();
const queuePrint = vi.fn();
const logPrint = vi.fn();
const fetchReceiptCopy = vi.fn();

vi.mock('../printHtml', () => ({ printHtml }));
vi.mock('../printTransports', () => ({
  printRawNetwork, printRawUSB, printRawBluetooth, printRawUSBPicked: vi.fn(),
  getPairedBluetoothPrinter: vi.fn(), getPairedUsbPrinter: vi.fn(), pairBluetoothPrinter: vi.fn(), pairUsbPrinter: vi.fn(),
}));
vi.mock('../desktopPrinter', () => ({ printRawToSystemPrinter }));
vi.mock('../printQueue', () => ({ queuePrint, logPrint, fetchReceiptCopy }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

const printer = await import('../printer');
const receiptPrint = await import('../receiptPrint');

const receipt: ReceiptData = {
  receiptNumber: 'R-1', businessName: 'Shop', storeName: 'Main', date: '2026-10-27T10:00:00', cashierName: 'Amina',
  items: [{ name: 'Tea', quantity: 1, unitPriceCents: 5000, totalCents: 5000 }],
  subtotalCents: 5000, totalCents: 5000, payments: [{ method: 'CASH', amountCents: 5000 }],
};

const kot: KOTData = {
  tableNumber: '4', orderType: 'NEW_ORDER', createdAt: '2026-10-27T10:00:00',
  items: [{ name: 'Burger', quantity: 1 }, { name: 'Beer', quantity: 2 }],
};

const kitchen = { id: 'k1', connectionType: 'NETWORK', connectionDetails: '192.168.1.5', handles: '["KOT_FOOD"]' };
const bar = { id: 'b1', connectionType: 'NETWORK', connectionDetails: '192.168.1.6', handles: '["KOT_DRINKS"]' };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  queuePrint.mockResolvedValue({ delivered: true });
  fetchReceiptCopy.mockResolvedValue(0);
});

describe('receipt print preference', () => {
  it('defaults to the system print dialog on a new terminal', () => {
    expect(receiptPrint.getReceiptPrintPref()).toEqual(expect.objectContaining({ method: 'browser', autoPrint: false }));
  });

  it('survives corrupt storage', () => {
    store.set('receipt-print-pref', '{not json');
    expect(receiptPrint.getReceiptPrintPref().method).toBe('browser');
    store.set('receipt-print-pref', JSON.stringify({ method: 'carrier-pigeon' }));
    expect(receiptPrint.getReceiptPrintPref().method).toBe('browser');
  });

  it('auto print does nothing unless switched on, and never when set to ask', async () => {
    receiptPrint.setReceiptPrintPref({ method: 'network', networkPrinterId: 'p1', autoPrint: false });
    expect(await receiptPrint.autoPrintReceipt(receipt)).toBe(false);
    receiptPrint.setReceiptPrintPref({ method: 'ask', autoPrint: true });
    expect(await receiptPrint.autoPrintReceipt(receipt)).toBe(false);
    expect(queuePrint).not.toHaveBeenCalled();
  });

  it('queues the receipt for the chosen LAN printer and reports a refusal', async () => {
    receiptPrint.setReceiptPrintPref({ method: 'network', networkPrinterId: 'p1', autoPrint: true });
    expect(await receiptPrint.autoPrintReceipt({ ...receipt, saleId: 'sale-1' })).toBe(true);
    expect(queuePrint).toHaveBeenCalledWith('p1', 'RECEIPT', expect.any(Uint8Array), { saleId: 'sale-1', refNumber: 'R-1', copyNumber: 0 });

    queuePrint.mockRejectedValueOnce(new Error('Printer not found'));
    await expect(receiptPrint.autoPrintReceipt(receipt)).rejects.toThrow('Printer not found');
  });

  it('marks a print the server says is not the first as a COPY, even if this till thinks it is the original', async () => {
    fetchReceiptCopy.mockResolvedValue(2);
    receiptPrint.setReceiptPrintPref({ method: 'network', networkPrinterId: 'p1', autoPrint: true });
    await receiptPrint.autoPrintReceipt({ ...receipt, saleId: 'sale-1' });
    expect(queuePrint.mock.calls[0][3]).toEqual(expect.objectContaining({ copyNumber: 2 }));
    const bytes = queuePrint.mock.calls[0][2] as Uint8Array;
    expect(Buffer.from(bytes).toString('latin1')).toContain('COPY 2');
  });

  it('still prints when the server cannot be asked, using this till\'s own count', async () => {
    fetchReceiptCopy.mockResolvedValue(null);
    receiptPrint.setReceiptPrintPref({ method: 'network', networkPrinterId: 'p1', autoPrint: true });
    await receiptPrint.autoPrintReceipt({ ...receipt, saleId: 'sale-1', copyNumber: 1 });
    expect(queuePrint.mock.calls[0][3]).toEqual(expect.objectContaining({ copyNumber: 1 }));
  });

  it('logs a print made on this device, with the failure reason when it fails', async () => {
    printRawUSB.mockResolvedValueOnce(undefined);
    await printer.printToUSB({ ...receipt, saleId: 'sale-1' });
    expect(logPrint).toHaveBeenLastCalledWith('RECEIPT', 'USB', true, undefined, { saleId: 'sale-1', refNumber: 'R-1', copyNumber: 0 });

    printRawUSB.mockRejectedValueOnce(new Error('No USB printer is paired'));
    await expect(printer.printToUSB({ ...receipt, saleId: 'sale-1' })).rejects.toThrow('No USB printer');
    expect(logPrint).toHaveBeenLastCalledWith('RECEIPT', 'USB', false, 'No USB printer is paired', expect.objectContaining({ saleId: 'sale-1' }));
  });

  it('records a drawer open for a cash sale that pops the drawer, and none for a copy', async () => {
    await printer.printToUSB({ ...receipt, saleId: 'sale-1' }, true);
    expect(logPrint).toHaveBeenCalledWith('DRAWER', 'USB', true, undefined, { saleId: 'sale-1', refNumber: 'R-1', reason: 'SALE' });
    logPrint.mockClear();
    fetchReceiptCopy.mockResolvedValue(1);
    await printer.printToUSB({ ...receipt, saleId: 'sale-1' }, true);
    expect(logPrint.mock.calls.some((c) => c[0] === 'DRAWER')).toBe(false);
  });

  it('flags a queued receipt that carries the drawer pulse', async () => {
    receiptPrint.setReceiptPrintPref({ method: 'network', networkPrinterId: 'p1', autoPrint: true });
    await receiptPrint.autoPrintReceipt({ ...receipt, saleId: 'sale-1' }, true);
    expect(queuePrint.mock.calls[0][3]).toEqual(expect.objectContaining({ reason: 'DRAWER_WITH_SALE' }));
  });

  it('a settings test print is logged as TEST, never as a receipt', async () => {
    await printer.printToBrowser({ ...receipt, receiptNumber: 'TEST-0001' });
    expect(logPrint).toHaveBeenLastCalledWith('TEST', 'BROWSER', true, undefined, expect.anything());
  });

  it('refuses a network or system method that has no printer chosen', async () => {
    await expect(receiptPrint.printReceiptVia('network', receipt, false, { method: 'network', autoPrint: true })).rejects.toThrow(/No network printer/);
    await expect(receiptPrint.printReceiptVia('system', receipt, false, { method: 'system', autoPrint: true })).rejects.toThrow(/No installed printer/);
  });
});

describe('receipt bytes', () => {
  it('uses the paper width chosen in Settings', () => {
    const widest = (w: 58 | 80) => {
      printer.setPaperWidth(w);
      const text = Buffer.from(printer.receiptBytes(receipt)).toString('latin1');
      // Control bytes are stripped on purpose: the width test counts printable characters only.
      // eslint-disable-next-line no-control-regex
      return Math.max(...text.split('\n').map((l) => l.replace(/[\x00-\x1f]/g, '').length));
    };
    expect(widest(58)).toBeLessThanOrEqual(32 + 8);
    expect(widest(80)).toBeGreaterThan(widest(58));
  });

  it('opens the drawer for a cash sale and never for a marked copy', () => {
    const pulse = (r: ReceiptData) => Array.from(printer.receiptBytes(r, true).slice(0, 2));
    expect(pulse(receipt)).toEqual([0x1b, 0x70]);
    expect(pulse({ ...receipt, copyNumber: 1 })).toEqual([0x1b, 0x40]);
  });
});

describe('kitchen ticket routing', () => {
  it('sends each station to its own printer', async () => {
    const report = await printer.printKOTWithRouting(kot, [kitchen, bar]);
    expect(report.failed).toEqual([]);
    expect(report.sent.sort()).toEqual(['KOT_DRINKS', 'KOT_FOOD']);
    expect(queuePrint).toHaveBeenCalledTimes(2);
    expect(queuePrint.mock.calls.map((c) => c[0]).sort()).toEqual(['b1', 'k1']);
    expect(queuePrint.mock.calls.every((c) => c[1] === 'KOT')).toBe(true);
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('REPORTS a printer that fails instead of swallowing it, and does not open a browser dialog for it', async () => {
    queuePrint.mockImplementation(async (id: string) => { if (id === 'b1') throw new Error('Cannot reach printer at 192.168.1.6'); return { delivered: true }; });
    const report = await printer.printKOTWithRouting(kot, [kitchen, bar]);
    expect(report.sent).toEqual(['KOT_FOOD']);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].station).toBe('KOT_DRINKS');
    expect(report.failed[0].error).toContain('192.168.1.6');
    expect(report.failed[0].kot.items.map((i) => i.name)).toEqual(['Beer']);
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('prints items with no printer in ONE browser ticket', async () => {
    const report = await printer.printKOTWithRouting(kot, [kitchen]);
    expect(report.sent).toEqual(['KOT_FOOD']);
    expect(report.usedBrowser).toBe(true);
    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(printHtml.mock.calls[0][0]).toContain('Beer');
    expect(printHtml.mock.calls[0][0]).not.toContain('Burger');
  });

  it('uses the browser for everything when no printers are configured', async () => {
    const report = await printer.printKOTWithRouting(kot, []);
    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(report.usedBrowser).toBe(true);
    expect(printHtml.mock.calls[0][0]).toContain('Burger');
    expect(printHtml.mock.calls[0][0]).toContain('Beer');
  });

  it('honours the station set on an item over the name', async () => {
    const report = await printer.printKOTWithRouting(
      { ...kot, items: [{ name: 'Fresh juice', quantity: 1, station: 'KITCHEN' }] },
      [kitchen, bar],
    );
    expect(report.sent).toEqual(['KOT_FOOD']);
    expect(queuePrint.mock.calls[0][0]).toBe('k1');
  });

  it('direct print throws so the caller can show the person', async () => {
    queuePrint.mockRejectedValueOnce(new Error('offline'));
    await expect(printer.printKOTDirect({ type: 'NETWORK_ESCPOS', networkPrinterId: 'k1' }, kot)).rejects.toThrow('offline');
    await expect(printer.printKOTDirect({ type: 'STAR' }, kot)).rejects.toThrow(/no address/);
  });
});

describe('printer self-test', () => {
  it('sends the diagnostic page to the chosen transport as raw bytes with the cut at the end', async () => {
    await printer.printDiagnostic('usb', {});
    const bytes = printRawUSB.mock.calls[0][0] as Uint8Array;
    expect(Buffer.from(bytes).toString('latin1')).toContain('PRINTER TEST');
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x41, 0x00]);
  });

  it('queues the network test as a TEST job, and needs a printer chosen', async () => {
    await printer.printDiagnostic('network', { networkPrinterId: 'p1' });
    expect(queuePrint).toHaveBeenCalledWith('p1', 'TEST', expect.any(Uint8Array));
    await expect(printer.printDiagnostic('network', {})).rejects.toThrow(/No network printer/);
    await expect(printer.printDiagnostic('system', {})).rejects.toThrow(/No installed printer/);
  });

  it('opens the drawer with the bare pulse and records it as a TEST, not a manual open', async () => {
    printRawBluetooth.mockResolvedValue(undefined);
    await printer.testCashDrawer('bluetooth', {});
    expect(Array.from(printRawBluetooth.mock.calls[0][0] as Uint8Array)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    await printer.testCashDrawer('network', { networkPrinterId: 'p1' });
    expect(queuePrint).toHaveBeenCalledWith('p1', 'DRAWER', expect.any(Uint8Array), { reason: 'TEST' });
    await expect(printer.testCashDrawer('browser', {})).rejects.toThrow(/cannot open the cash drawer/);
  });
});

describe('barcode labels', () => {
  it('cannot be hijacked by ZPL control characters in an item name', () => {
    const zpl = printer.generateZPL({ itemName: 'Evil^XA^FDpwn~DG', barcode: '123^456', priceCents: 1000 });
    expect(zpl.match(/\^XA/g)).toHaveLength(1);
    expect(zpl).not.toContain('~');
    expect(zpl).toContain('Evil XA FDpwn DG');
  });
});
