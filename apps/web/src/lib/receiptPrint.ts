/**
 * Receipt printing preference — the "enterprise" flow.
 *
 * Instead of asking the cashier to pick a print method on every sale, the
 * printer is configured once (per terminal) in Settings → Printers. On
 * checkout the receipt prints silently to that printer. The method picker
 * (PrintModal) is only used as an explicit override or when nothing is set.
 *
 * The preference lives in localStorage because the printer is physical and
 * terminal-specific — the USB/Bluetooth/network printer attached to THIS till.
 */
import {
  printToBrowser, printToUSB, printToBluetooth,
  printToStarWebPRNT, printToEpsonEPOS,
  type ReceiptData, type StarPrinterConfig, type EpsonPrinterConfig,
} from './printer';

export type PrintMethod = 'ask' | 'browser' | 'usb' | 'bluetooth' | 'star' | 'epson';

export interface ReceiptPrintPref {
  method: PrintMethod;
  /** Print automatically on checkout (no popup). Ignored when method is 'ask'. */
  autoPrint: boolean;
}

const KEY = 'receipt-print-pref';

const DEFAULT_PREF: ReceiptPrintPref = { method: 'ask', autoPrint: false };

export function getReceiptPrintPref(): ReceiptPrintPref {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREF;
    const p = JSON.parse(raw) as Partial<ReceiptPrintPref>;
    return { method: p.method ?? 'ask', autoPrint: p.autoPrint ?? false };
  } catch {
    return DEFAULT_PREF;
  }
}

export function setReceiptPrintPref(pref: ReceiptPrintPref): void {
  try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch { /* ignore */ }
}

function readJSON<T>(key: string): T | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}

/**
 * Print a receipt using a specific method. Network methods read their saved
 * config from localStorage (set in Settings → Printers). Throws if the device
 * isn't available so the caller can fall back to the picker.
 */
export async function printReceiptVia(
  method: Exclude<PrintMethod, 'ask'>,
  receipt: ReceiptData,
  enableCashDrawer = false,
): Promise<void> {
  switch (method) {
    case 'browser':
      printToBrowser(receipt);
      return;
    case 'usb':
      await printToUSB(receipt, enableCashDrawer);
      return;
    case 'bluetooth':
      await printToBluetooth(receipt, enableCashDrawer);
      return;
    case 'star': {
      const cfg = readJSON<StarPrinterConfig>('star-printer');
      if (!cfg) throw new Error('No Star printer configured');
      await printToStarWebPRNT(cfg, receipt);
      return;
    }
    case 'epson': {
      const cfg = readJSON<EpsonPrinterConfig>('epson-printer');
      if (!cfg) throw new Error('No Epson printer configured');
      await printToEpsonEPOS(cfg, receipt);
      return;
    }
  }
}

/**
 * Auto-print on checkout if the terminal is configured for it.
 * Returns true if it printed (or fired the print), false if the caller should
 * fall back to showing the picker modal.
 */
export async function autoPrintReceipt(
  receipt: ReceiptData,
  enableCashDrawer = false,
): Promise<boolean> {
  const pref = getReceiptPrintPref();
  if (!pref.autoPrint || pref.method === 'ask') return false;
  await printReceiptVia(pref.method, receipt, enableCashDrawer);
  return true;
}
