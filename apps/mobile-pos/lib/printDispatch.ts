/**
 * Sends a receipt to the printer chosen in Settings. The native transports are
 * injected (printTransport.ts in the app, fakes in tests) so this stays pure.
 */
import { buildReceiptBytes } from './escpos';
import { configProblem, DEFAULT_NETWORK_PORT, type PrinterSettings } from './printerConfig';
import type { PaperWidth, PrintableReceipt } from './receiptModel';

export interface PrintTransports {
  sendBluetooth(address: string, bytes: Uint8Array): Promise<void>;
  sendNetwork(host: string, port: number, bytes: Uint8Array): Promise<void>;
  printSystem(receipt: PrintableReceipt, paperWidth: PaperWidth): Promise<void>;
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
