/**
 * Sends a receipt to the printer chosen in Settings. The native transports are
 * injected (printTransport.ts in the app, fakes in tests) so this stays pure.
 */
import { diagnosticEscPos, diagnosticHtml } from '@pos/print-core';
import { buildReceiptBytes } from './escpos';
import { configProblem, DEFAULT_NETWORK_PORT, type PrinterSettings } from './printerConfig';
import type { PaperWidth, PrintableReceipt } from './receiptModel';

export interface PrintTransports {
  sendBluetooth(address: string, bytes: Uint8Array): Promise<void>;
  sendNetwork(host: string, port: number, bytes: Uint8Array): Promise<void>;
  printSystem(receipt: PrintableReceipt, paperWidth: PaperWidth): Promise<void>;
  /** The OS print sheet for an HTML page that is not a receipt (the printer test page). */
  printSystemHtml(html: string): Promise<void>;
}

export async function dispatchPrint(
  settings: PrinterSettings,
  receipt: PrintableReceipt,
  transports: PrintTransports,
): Promise<void> {
  const problem = configProblem(settings);
  if (problem) throw new Error(problem);

  switch (settings.method) {
    case 'bluetooth':
      return transports.sendBluetooth(settings.bluetooth!.address, buildReceiptBytes(receipt, settings.paperWidth));
    case 'network':
      return transports.sendNetwork(
        settings.network!.host,
        settings.network!.port || DEFAULT_NETWORK_PORT,
        buildReceiptBytes(receipt, settings.paperWidth),
      );
    default:
      return transports.printSystem(receipt, settings.paperWidth);
  }
}

/**
 * The full printer test page (columns, alignment, sizes, characters, QR, cut) on the chosen printer, for checking a
 * new printer model once. Uses the settings on screen, saved or not, like the test receipt.
 */
export async function dispatchDiagnostic(settings: PrinterSettings, transports: PrintTransports): Promise<void> {
  const problem = configProblem(settings);
  if (problem) throw new Error(problem);
  const o = { paperWidth: settings.paperWidth };
  switch (settings.method) {
    case 'bluetooth':
      return transports.sendBluetooth(settings.bluetooth!.address, diagnosticEscPos(o));
    case 'network':
      return transports.sendNetwork(settings.network!.host, settings.network!.port || DEFAULT_NETWORK_PORT, diagnosticEscPos(o));
    default:
      return transports.printSystemHtml(diagnosticHtml(o));
  }
}
