/**
 * Receipt printing preference.
 *
 * The printer is configured once (per terminal) in Settings -> Printers, and
 * every sale then prints to it with no picker. The method picker (PrintModal)
 * is only an explicit override, or the fallback when the configured printer
 * cannot be reached, so a receipt is never silently lost.
 *
 * The preference lives in localStorage because the printer is physical and
 * terminal-specific: the USB/Bluetooth/network printer attached to THIS till.
 */
import {
  printToBrowser, printToUSB, printToBluetooth, printToNetwork,
  printToStarWebPRNT, printToEpsonEPOS, printToSystemPrinter,
  type ReceiptData, type StarPrinterConfig, type EpsonPrinterConfig,
} from './printer';

export type PrintMethod = 'ask' | 'browser' | 'system' | 'usb' | 'bluetooth' | 'network' | 'star' | 'epson';

export interface ReceiptPrintPref {
  method: PrintMethod;
  /** Print automatically on checkout (no popup). Ignored when method is 'ask'. */
  autoPrint: boolean;
  /** For method 'network': the Printer row (Settings -> Printers) the API forwards to. */
  networkPrinterId?: string;
  /** For method 'system': the installed printer's name, as listed by the desktop app. */
  systemPrinterName?: string;
}

const KEY = 'receipt-print-pref';

// New terminals use the system printer: the browser's print dialog lists every printer installed on the
// computer (thermal printers included, through their normal driver), so nothing has to be paired. The raw
// ESC/POS modes below are opt-in for hardware that has no driver or must print without the dialog.
const DEFAULT_PREF: ReceiptPrintPref = { method: 'browser', autoPrint: false };

const METHODS: PrintMethod[] = ['ask', 'browser', 'system', 'usb', 'bluetooth', 'network', 'star', 'epson'];

export function getReceiptPrintPref(): ReceiptPrintPref {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREF;
    const p = JSON.parse(raw) as Partial<ReceiptPrintPref>;
    return {
      method: p.method && METHODS.includes(p.method) ? p.method : DEFAULT_PREF.method,
      autoPrint: p.autoPrint ?? false,
      networkPrinterId: p.networkPrinterId,
      systemPrinterName: p.systemPrinterName,
    };
  } catch {
    return DEFAULT_PREF;
  }
}

export function setReceiptPrintPref(pref: ReceiptPrintPref): void {
  try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch { /* storage unavailable */ }
}

function readJSON<T>(key: string): T | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}

export const getSavedStarPrinter = () => readJSON<StarPrinterConfig>('star-printer');
export const getSavedEpsonPrinter = () => readJSON<EpsonPrinterConfig>('epson-printer');

/**
 * Print a receipt using a specific method. Throws with a readable reason if the
 * device is not available so the caller can fall back to the picker.
 */
export async function printReceiptVia(
  method: Exclude<PrintMethod, 'ask'>,
  receipt: ReceiptData,
  enableCashDrawer = false,
  pref: ReceiptPrintPref = getReceiptPrintPref(),
): Promise<void> {
  switch (method) {
    case 'browser':
      printToBrowser(receipt);
      return;
    case 'system':
      if (!pref.systemPrinterName) throw new Error('No installed printer selected in Settings -> Printers');
      await printToSystemPrinter(pref.systemPrinterName, receipt, enableCashDrawer);
      return;
    case 'usb':
      await printToUSB(receipt, enableCashDrawer);
      return;
    case 'bluetooth':
      await printToBluetooth(receipt, enableCashDrawer);
      return;
    case 'network':
      if (!pref.networkPrinterId) throw new Error('No network printer selected in Settings -> Printers');
      await printToNetwork(pref.networkPrinterId, receipt, enableCashDrawer);
      return;
    case 'star': {
      const cfg = getSavedStarPrinter();
      if (!cfg) throw new Error('No Star printer configured');
      await printToStarWebPRNT(cfg, receipt);
      return;
    }
    case 'epson': {
      const cfg = getSavedEpsonPrinter();
      if (!cfg) throw new Error('No Epson printer configured');
      await printToEpsonEPOS(cfg, receipt);
      return;
    }
  }
}

/**
 * Auto-print on checkout if the terminal is configured for it.
 * Returns true if it printed (or fired the print), false if the caller should
 * show the picker. Throws if the configured printer failed.
 */
export async function autoPrintReceipt(
  receipt: ReceiptData,
  enableCashDrawer = false,
): Promise<boolean> {
  const pref = getReceiptPrintPref();
  if (!pref.autoPrint || pref.method === 'ask') return false;
  await printReceiptVia(pref.method, receipt, enableCashDrawer, pref);
  return true;
}

/**
 * Print on an explicit request (Reprint, Print button). Uses the configured
 * printer whenever one is set, regardless of the auto-print switch. Returns
 * false when the terminal is set to "ask", so the caller shows the picker.
 */
export async function printWithPreferredPrinter(
  receipt: ReceiptData,
  enableCashDrawer = false,
): Promise<boolean> {
  const pref = getReceiptPrintPref();
  if (pref.method === 'ask') return false;
  await printReceiptVia(pref.method, receipt, enableCashDrawer, pref);
  return true;
}

/** Short reason text for a failed print, suitable for a toast or banner. */
export function printErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'The printer did not respond';
}

/** A harmless receipt for the Settings "Print test" button. */
export function buildTestReceipt(businessName = 'Printer test'): ReceiptData {
  return {
    receiptNumber: 'TEST-0001',
    businessName,
    storeName: 'Printer test receipt',
    date: new Date().toISOString(),
    cashierName: 'Settings',
    items: [
      { name: 'Test item', quantity: 2, unitPriceCents: 15000, totalCents: 30000 },
      { name: 'Long item name that has to wrap or be cut', quantity: 1, unitPriceCents: 4550, totalCents: 4550 },
    ],
    subtotalCents: 34550,
    vatCents: 4766,
    totalCents: 34550,
    payments: [{ method: 'CASH', amountCents: 40000 }],
    changeCents: 5450,
    receiptFooter: 'If you can read this, the printer is set up correctly.',
  };
}
