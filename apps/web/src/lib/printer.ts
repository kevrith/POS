// Printing entry points for the web app. WHAT is printed (layout, wording, fiscal
// banners) lives in @pos/print-core and is the same for every printer type; this file
// only decides WHERE it goes: the browser print dialog, a raw USB/Bluetooth/LAN
// printer, an installed printer through the desktop app, or a Star/Epson HTTP printer.

import { printRawToSystemPrinter } from './desktopPrinter';
import { printHtml } from './printHtml';
import { fetchReceiptCopy, logPrint, queuePrint, type ClientPrintMethod, type PrintJobKind } from './printQueue';
import { printRawBluetooth, printRawUSB, printRawUSBPicked } from './printTransports';
import {
  DRAWER_PULSE, PAPER_COLUMNS, billHtml, drawerPulseBytes, encodeLatin1, escapeHtml,
  kotEpsonXml, kotEscPos, kotHtml, kotStarXml, receiptEpsonXml, receiptEscPos, receiptHtml, receiptOpensDrawer, receiptStarXml,
  routeKotItems, asciiSafe,
  type BillDocument, type KotDocument, type PaperWidth, type ReceiptDocument, type RoutablePrinter,
} from '@pos/print-core';

export type ReceiptData = ReceiptDocument;
export type BillData = BillDocument;
export type KOTData = KotDocument;
export type { PaperWidth, RoutablePrinter };
export { PAPER_COLUMNS };

export {
  getPairedBluetoothPrinter, getPairedUsbPrinter, pairBluetoothPrinter, pairUsbPrinter,
  printRawBluetooth, printRawNetwork, printRawUSB,
  type PairedPrinter,
} from './printTransports';

// ─── Paper width ──────────────────────────────────────────────────────────────

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

// Thermal printers are most often 58 mm on a phone and 80 mm on a counter, but a page printed through the
// browser is read on a wide slip, so each medium has its own default until the owner picks a width.
const rawWidth = (): PaperWidth => getPaperWidth() ?? 58;
const pageWidth = (): PaperWidth => getPaperWidth() ?? 80;

// ─── Receipt ──────────────────────────────────────────────────────────────────

/** A settings test print is logged as TEST so it is never mistaken for a sale's receipt. */
const receiptKind = (r: ReceiptData): PrintJobKind => (r.receiptNumber.startsWith('TEST-') ? 'TEST' : 'RECEIPT');

/**
 * Every print after the first of a sale is a marked COPY. The server knows how many times the sale has been
 * printed on ANY till; this device's own count (copyNumber already on the receipt) covers being offline.
 */
async function withCopyNumber(receipt: ReceiptData): Promise<ReceiptData> {
  if (!receipt.saleId) return receipt;
  const server = await fetchReceiptCopy(receipt.saleId);
  const copy = Math.max(receipt.copyNumber ?? 0, server ?? 0);
  return copy === (receipt.copyNumber ?? 0) ? receipt : { ...receipt, copyNumber: copy };
}

/**
 * Print a receipt on this device and record the outcome. When the receipt also pops the cash drawer, that is
 * recorded as its own DRAWER entry with the reason SALE, so every drawer open can be accounted for.
 */
async function printLocally(
  method: ClientPrintMethod,
  receipt: ReceiptData,
  send: (r: ReceiptData) => Promise<void> | void,
  enableCashDrawer = false,
): Promise<void> {
  const r = await withCopyNumber(receipt);
  const meta = { saleId: r.saleId, refNumber: r.receiptNumber, copyNumber: r.copyNumber ?? 0 };
  try {
    await send(r);
  } catch (err) {
    logPrint(receiptKind(r), method, false, err instanceof Error ? err.message : 'Print failed', meta);
    throw err;
  }
  logPrint(receiptKind(r), method, true, undefined, meta);
  if (receiptOpensDrawer(r, enableCashDrawer)) logPrint('DRAWER', method, true, undefined, { saleId: r.saleId, refNumber: r.receiptNumber, reason: 'SALE' });
}

/** Print to the browser / OS print dialog. */
export function printToBrowser(receipt: ReceiptData): Promise<void> {
  return printLocally('BROWSER', receipt, (r) => printHtml(receiptHtml(r, { paperWidth: pageWidth() })));
}

/** Raw ESC/POS bytes for a receipt, ready for any byte transport. */
export function receiptBytes(receipt: ReceiptData, enableCashDrawer = false): Uint8Array {
  return receiptEscPos(receipt, { paperWidth: rawWidth(), enableCashDrawer });
}

/** Print to a LAN thermal printer through the server print queue (the job is its own record). */
export async function printToNetwork(printerId: string, receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  const r = await withCopyNumber(receipt);
  await queuePrint(printerId, receiptKind(r), receiptBytes(r, enableCashDrawer), {
    saleId: r.saleId, refNumber: r.receiptNumber, copyNumber: r.copyNumber ?? 0,
    // The pulse travels inside the receipt job; the reason makes it count as a drawer open in the audit.
    ...(receiptOpensDrawer(r, enableCashDrawer) && { reason: 'DRAWER_WITH_SALE' }),
  });
}

/** Print to a printer installed on this computer, silently, through the desktop app. */
export function printToSystemPrinter(printerName: string, receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  return printLocally('SYSTEM', receipt, (r) => printRawToSystemPrinter(printerName, receiptBytes(r, enableCashDrawer)), enableCashDrawer);
}

export function printToUSB(receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  return printLocally('USB', receipt, (r) => printRawUSB(receiptBytes(r, enableCashDrawer)), enableCashDrawer);
}

export function printToBluetooth(receipt: ReceiptData, enableCashDrawer = false): Promise<void> {
  return printLocally('BLUETOOTH', receipt, (r) => printRawBluetooth(receiptBytes(r, enableCashDrawer)), enableCashDrawer);
}

/** Open the cash drawer wired to a network printer. Recorded with who asked and why. */
export async function openDrawerOnNetwork(printerId: string, reason = 'MANUAL'): Promise<void> {
  await queuePrint(printerId, 'DRAWER', drawerPulseBytes(), { reason });
}

/** Open the cash drawer wired to the paired USB printer. Recorded with who asked and why. */
export async function openDrawerViaUSB(reason = 'MANUAL'): Promise<void> {
  try {
    await printRawUSB(drawerPulseBytes());
  } catch (err) {
    logPrint('DRAWER', 'USB', false, err instanceof Error ? err.message : 'Print failed', { reason });
    throw err;
  }
  logPrint('DRAWER', 'USB', true, undefined, { reason });
}

export { DRAWER_PULSE };

// ─── Star WebPRNT and Epson ePOS (HTTP straight to a LAN printer) ─────────────

export interface StarPrinterConfig {
  /** LAN IP or hostname of the Star printer, e.g. "192.168.1.100" */
  host: string;
  /** Star WebPRNT default is 8008 */
  port?: number;
}

export interface EpsonPrinterConfig {
  /** LAN IP or hostname of the Epson printer */
  host: string;
  /** Printer device ID, default "local_printer" */
  deviceId?: string;
}

const HTTP_TIMEOUT_MS = 10000;

async function postToPrinter(url: string, body: string, contentType: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType, ...extraHeaders }, body, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`The printer at ${url.split('/')[2]} did not answer`);
    throw new Error(`Cannot reach the printer at ${url.split('/')[2]}. A browser cannot send to a printer from an https page.`);
  } finally {
    clearTimeout(timer);
  }
}

async function sendStar(config: StarPrinterConfig, xml: string): Promise<void> {
  const res = await postToPrinter(`http://${config.host}:${config.port ?? 8008}/WebPRNT/SendMessage`, xml, 'application/xml; charset=utf-8');
  if (!res.ok) throw new Error(`Star WebPRNT error: ${res.status} ${res.statusText}`);
}

async function sendEpson(config: EpsonPrinterConfig, xml: string): Promise<void> {
  const res = await postToPrinter(
    `http://${config.host}/cgi-bin/epos/service.cgi?devid=${encodeURIComponent(config.deviceId ?? 'local_printer')}&timeout=10000`,
    xml,
    'text/xml; charset=utf-8',
    { SOAPAction: '""' },
  );
  if (!res.ok) throw new Error(`Epson ePOS error: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (/success="false"/i.test(text) || text.includes('SchemaError') || text.includes('DeviceNotFound')) {
    throw new Error(`Epson ePOS rejected the job: ${text.substring(0, 200)}`);
  }
}

export const printToStarWebPRNT = (config: StarPrinterConfig, receipt: ReceiptData) =>
  printLocally('STAR', receipt, (r) => sendStar(config, receiptStarXml(r, { paperWidth: rawWidth() })));

export const printToEpsonEPOS = (config: EpsonPrinterConfig, receipt: ReceiptData, enableCashDrawer = false) =>
  printLocally('EPSON', receipt, (r) => sendEpson(config, receiptEpsonXml(r, { paperWidth: rawWidth(), enableCashDrawer })), enableCashDrawer);

// ─── Table bill ───────────────────────────────────────────────────────────────

export function printBill(bill: BillData): void {
  printHtml(billHtml(bill, { paperWidth: pageWidth() }));
  logPrint('BILL', 'BROWSER', true, undefined, { refNumber: `T${bill.tableNumber}` });
}

// ─── Kitchen order tickets ────────────────────────────────────────────────────

export function printKOT(kot: KOTData): void {
  printHtml(kotHtml(kot, { paperWidth: pageWidth() }));
  logPrint('KOT', 'BROWSER', true, undefined, { refNumber: kot.kotNumber ?? `T${kot.tableNumber}` });
}

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
 * Print a KOT directly to a hardware printer. THROWS when the printer cannot be
 * reached: a silent browser dialog on a waiter's tablet is not a kitchen ticket, so the
 * caller decides what the person sees and whether to print it here instead.
 */
export async function printKOTDirect(config: KOTPrinterConfig, kot: KOTData): Promise<void> {
  const o = { paperWidth: rawWidth() };
  switch (config.type) {
    case 'STAR':
      if (!config.host) throw new Error('The Star kitchen printer has no address');
      return sendStar({ host: config.host, port: config.port }, kotStarXml(kot, o));
    case 'EPSON':
      if (!config.host) throw new Error('The Epson kitchen printer has no address');
      return sendEpson({ host: config.host, deviceId: config.deviceId }, kotEpsonXml(kot, o));
    case 'NETWORK_ESCPOS':
      if (!config.networkPrinterId) throw new Error('The kitchen printer is not selected');
      await queuePrint(config.networkPrinterId, 'KOT', kotEscPos(kot, o), { refNumber: kot.kotNumber ?? `T${kot.tableNumber}` });
      return;
    default:
      printKOT(kot);
  }
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

export interface KotPrintFailure {
  station: string;
  error: string;
  /** The ticket that did not print, so the person can print it here instead. */
  kot: KOTData;
}

export interface KotPrintReport {
  /** Stations whose ticket reached its printer. */
  sent: string[];
  /** Tickets that could not be delivered. Nothing is hidden: show these to the person. */
  failed: KotPrintFailure[];
  /** True when some items had no printer and were opened in the browser print dialog. */
  usedBrowser: boolean;
}

/**
 * Print a KOT with printer routing: items are split by station (KOT_FOOD, KOT_DRINKS,
 * KOT_DESSERTS) and each group goes to the printer that handles it. Items with no printer
 * for their station are combined into one browser ticket so an order is never lost and
 * never opens one dialog per station. A printer that fails is reported, not swallowed.
 */
export async function printKOTWithRouting(kot: KOTData, printers: RoutablePrinter[]): Promise<KotPrintReport> {
  const report: KotPrintReport = { sent: [], failed: [], usedBrowser: false };
  const unrouted: KOTData['items'] = [];
  const jobs: Array<Promise<void>> = [];

  for (const route of routeKotItems(kot.items, printers)) {
    const config = route.printer ? printerToKotConfig(route.printer) : null;
    const ticket = { ...kot, items: route.items };
    if (!config) { unrouted.push(...route.items); continue; }
    jobs.push(
      printKOTDirect(config, ticket).then(
        () => { report.sent.push(route.station); },
        (err: unknown) => { report.failed.push({ station: route.station, error: err instanceof Error ? err.message : 'The printer did not respond', kot: ticket }); },
      ),
    );
  }

  if (unrouted.length > 0 || kot.items.length === 0) {
    printKOT({ ...kot, items: kot.items.length === 0 ? kot.items : unrouted });
    report.usedBrowser = true;
  }
  await Promise.all(jobs);
  return report;
}

// ─── Barcode labels (ZPL for Zebra, HTML for any printer) ─────────────────────

export interface BarcodeLabelData {
  itemName: string;
  barcode: string;
  priceCents: number;
  businessName?: string;
  sku?: string;
  /** Label size in dots (203 DPI). Default: 2" x 1" = 406 x 203 */
  widthDots?: number;
  heightDots?: number;
}

/** ZPL treats ^ and ~ as command prefixes, so they can never appear in field data. */
const zplText = (s: string, max: number) => asciiSafe(s).replace(/[\^~]/g, ' ').substring(0, max);

/**
 * Generate ZPL II code for a single barcode label.
 * Compatible with Zebra ZT200/ZT400/ZD400 and any ZPL-compatible thermal printer.
 * Default label: 2" x 1" at 203 DPI.
 */
export function generateZPL(label: BarcodeLabelData): string {
  const w = label.widthDots ?? 406;
  const h = label.heightDots ?? 203;
  const price = `KES ${(label.priceCents / 100).toFixed(2)}`;
  return [
    '^XA',
    `^PW${w}`,
    `^LL${h}`,
    ...(label.businessName ? [`^FO10,10^A0N,16,16^FD${zplText(label.businessName, 30)}^FS`] : []),
    `^FO10,${label.businessName ? 30 : 10}^A0N,22,22^FD${zplText(label.itemName, 28)}^FS`,
    '^FO10,60^BY2,2.5,60',
    '^BCN,60,Y,N,N',
    `^FD${zplText(label.barcode, 40)}^FS`,
    `^FO${w - 120},140^A0N,28,28^FD${price}^FS`,
    ...(label.sku ? [`^FO10,175^A0N,14,14^FD${zplText(label.sku, 24)}^FS`] : []),
    '^XZ',
  ].join('\n');
}

/** Print ZPL to a Zebra printer via WebUSB (Chrome/Edge). Must run from a click. */
export async function printZPLviaUSB(label: BarcodeLabelData, copies = 1): Promise<void> {
  const job = Array(copies).fill(generateZPL(label)).join('\n');
  try {
    await printRawUSBPicked(encodeLatin1(job), 0x0a5f); // 0x0A5F: Zebra Technologies
  } catch (error) {
    throw new Error(`ZPL print failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/** Download ZPL as a .zpl file (for network Zebra printers or raw print spoolers). */
export function downloadZPL(label: BarcodeLabelData, copies = 1): void {
  const zpl = Array(copies).fill(generateZPL(label)).join('\n');
  const blob = new Blob([zpl], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `label-${label.barcode}.zpl`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** A Code 128 barcode as inline SVG: no script, no network, prints offline. */
export async function barcodeSvg(value: string): Promise<string> {
  const { default: JsBarcode } = await import('jsbarcode');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, { format: 'CODE128', displayValue: true, fontSize: 7, height: 35, margin: 0, width: 1.2 });
  const w = svg.getAttribute('width');
  const h = svg.getAttribute('height');
  if (w && h) svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg.outerHTML;
}

/** HTML for one 50.8 x 25.4 mm label. */
export async function barcodeLabelHtml(label: BarcodeLabelData): Promise<string> {
  const price = `KES ${(label.priceCents / 100).toFixed(2)}`;
  const svg = await barcodeSvg(label.barcode);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Label ${escapeHtml(label.barcode)}</title>
  <style>
    @media print { @page { margin: 0; size: 50.8mm 25.4mm; } body { margin: 0; } }
    body { font-family: Arial, sans-serif; width: 50.8mm; height: 25.4mm; overflow: hidden;
           display: flex; flex-direction: column; padding: 2mm; box-sizing: border-box; margin: 0; }
    .name { font-size: 7pt; font-weight: bold; margin-bottom: 1mm; white-space: nowrap; overflow: hidden; }
    .biz  { font-size: 6pt; color: #555; margin-bottom: 1mm; }
    svg { width: 100%; height: 12mm; }
    .footer { display: flex; justify-content: space-between; margin-top: 1mm; }
    .price { font-size: 9pt; font-weight: bold; }
    .sku   { font-size: 5pt; color: #666; }
  </style>
</head>
<body>
  ${label.businessName ? `<div class="biz">${escapeHtml(label.businessName)}</div>` : ''}
  <div class="name">${escapeHtml(label.itemName)}</div>
  ${svg}
  <div class="footer">
    ${label.sku ? `<span class="sku">${escapeHtml(label.sku)}</span>` : '<span></span>'}
    <span class="price">${price}</span>
  </div>
</body>
</html>`;
}

/** Print one barcode label through the browser print dialog. */
export async function printBarcodeLabel(label: BarcodeLabelData): Promise<void> {
  printHtml(await barcodeLabelHtml(label), 200);
}
