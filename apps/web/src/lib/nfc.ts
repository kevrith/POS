/**
 * NFC Tap-to-Pay — Web NFC API (Chrome for Android 89+, Chrome OS).
 *
 * Reads ISO 14443-A / ISO 15693 NFC tags and EMV contactless card data.
 * On Android Chrome the NDEFReader API gives us the card UID and any NDEF
 * records. For EMV contactless (Visa/Mastercard tap) the UID is used as a
 * payment token reference — actual authorisation still goes through the
 * card terminal SDK or Paystack.
 *
 * Usage:
 *   const reader = new NFCPaymentReader();
 *   const result = await reader.read(30000);  // 30s timeout
 *   reader.stop();
 */

export interface NFCReadResult {
  /** Hex UID of the card/tag */
  uid: string;
  /** NDEF text records if present (e.g. loyalty card data) */
  records: string[];
  /** Raw serial number as returned by the browser */
  serialNumber: string;
}

export class NFCPaymentReader {
  private reader: any = null;
  private abortController: AbortController | null = null;

  /** Returns true if Web NFC is available in this browser/device. */
  static isAvailable(): boolean {
    return 'NDEFReader' in window;
  }

  /**
   * Start scanning for NFC tags/cards.
   * Resolves with the first tag read, or rejects on timeout.
   */
  async read(timeoutMs = 30000): Promise<NFCReadResult> {
    if (!NFCPaymentReader.isAvailable()) {
      throw new Error('Web NFC not supported. Use Chrome on Android or ChromeOS.');
    }

    this.abortController = new AbortController();
    this.reader = new (window as any).NDEFReader();

    return new Promise<NFCReadResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop();
        reject(new Error('NFC scan timed out. Please tap your card again.'));
      }, timeoutMs);

      this.reader.addEventListener('reading', (event: any) => {
        clearTimeout(timer);
        const uid = event.serialNumber
          ? event.serialNumber.replace(/:/g, '').toUpperCase()
          : 'UNKNOWN';

        const records: string[] = [];
        for (const record of event.message?.records ?? []) {
          if (record.recordType === 'text') {
            try {
              const decoder = new TextDecoder(record.encoding ?? 'utf-8');
              records.push(decoder.decode(record.data));
            } catch { /* skip unreadable records */ }
          }
        }

        resolve({ uid, records, serialNumber: event.serialNumber ?? '' });
      });

      this.reader.addEventListener('readingerror', () => {
        clearTimeout(timer);
        reject(new Error('NFC read error. Ensure NFC is enabled and try again.'));
      });

      this.reader
        .scan({ signal: this.abortController!.signal })
        .catch((err: Error) => {
          clearTimeout(timer);
          reject(new Error(`NFC scan failed: ${err.message}`));
        });
    });
  }

  /** Stop the NFC reader. */
  stop(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.reader = null;
  }
}

/**
 * Write an NDEF text record to an NFC tag (for loyalty card programming).
 */
export async function writeNFCTag(text: string): Promise<void> {
  if (!NFCPaymentReader.isAvailable()) {
    throw new Error('Web NFC not supported.');
  }
  const writer = new (window as any).NDEFReader();
  await writer.write({ records: [{ recordType: 'text', data: text }] });
}
