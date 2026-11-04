/**
 * Receipt printing for the mobile cashier app.
 *
 * Printing is OFF by default: most mobile selling has no printer and relies on
 * digital receipts. When the cashier has one, they pick how to reach it in
 * Settings once (system print dialog, Bluetooth, or Wi-Fi/LAN thermal printer)
 * and the paper roll width (58 mm small Bluetooth printers, 80 mm standard
 * thermal printers). Bluetooth and LAN print silently, so a sale can print
 * automatically with no dialog.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dispatchDiagnostic, dispatchPrint } from './printDispatch';
import { DEFAULT_PRINTER_SETTINGS, normalizeSettings, type PrinterSettings } from './printerConfig';
import { nativeTransports } from './printTransport';
import { buildTestReceipt, type PrintableReceipt } from './receiptModel';

export type { PrintableReceipt, ReceiptLine, PaperWidth } from './receiptModel';
export { listBondedPrinters } from './printTransport';

const KEY = 'mobile-printer-settings';
const LEGACY_ENABLED_KEY = 'mobile-receipt-print-enabled';

export async function loadPrinterSettings(): Promise<PrinterSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
    // Before 1.2 the only setting was an on/off switch for the system print dialog.
    if ((await AsyncStorage.getItem(LEGACY_ENABLED_KEY)) === 'true') {
      return { ...DEFAULT_PRINTER_SETTINGS, enabled: true };
    }
  } catch {
    /* unreadable storage: behave as unconfigured */
  }
  return { ...DEFAULT_PRINTER_SETTINGS };
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

export async function isPrintingEnabled(): Promise<boolean> {
  return (await loadPrinterSettings()).enabled;
}

/** Print with the saved settings. Throws an Error with a readable reason on failure. */
export async function printReceipt(r: PrintableReceipt, settings?: PrinterSettings): Promise<void> {
  await dispatchPrint(settings ?? (await loadPrinterSettings()), r, nativeTransports);
}

/** Settings screen "Print test receipt": uses the settings currently on screen, saved or not. */
export async function printTestReceipt(settings: PrinterSettings, businessName?: string): Promise<void> {
  await dispatchPrint(settings, buildTestReceipt(businessName), nativeTransports);
}

/** Settings "Print full test page": check columns, alignment, characters, QR and cut on a new printer. */
export async function printDiagnosticPage(settings: PrinterSettings): Promise<void> {
  await dispatchDiagnostic(settings, nativeTransports);
}
