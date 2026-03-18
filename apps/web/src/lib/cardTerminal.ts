/**
 * Card Terminal SDK — Web Serial API bridge for PAX / Ingenico / Verifone terminals.
 *
 * Protocol: ISO 8583-inspired simple TLV framing used by PAX A-series and
 * Ingenico iCT/iWL over RS-232 / USB-CDC.
 *
 * Frame format (PAX POSLINK-lite subset):
 *   STX (0x02) | LEN_HI | LEN_LO | COMMAND | DATA... | ETX (0x03) | LRC
 *
 * For Ingenico Telium/Tetra the same framing applies with different command codes.
 * Verifone MX-series uses the same USB-CDC transport with OPOS/JavaPOS on top —
 * we implement the raw serial path here.
 */

const STX = 0x02;
const ETX = 0x03;

export type CardTerminalBrand = 'PAX' | 'INGENICO' | 'VERIFONE';

export interface CardTerminalConfig {
  brand: CardTerminalBrand;
  /** Baud rate — PAX default 115200, Ingenico 9600 */
  baudRate?: number;
}

export interface CardPaymentResult {
  approved: boolean;
  responseCode: string;
  authCode?: string;
  maskedPan?: string;
  cardScheme?: string;
  amountCents: number;
  reference: string;
}

// ─── LRC checksum ─────────────────────────────────────────────────────────────

function lrc(bytes: Uint8Array): number {
  return bytes.reduce((acc, b) => acc ^ b, 0);
}

// ─── Frame builder ────────────────────────────────────────────────────────────

function buildFrame(command: number, data: Uint8Array): Uint8Array {
  const len = data.length + 1; // +1 for command byte
  const frame = new Uint8Array(5 + data.length);
  frame[0] = STX;
  frame[1] = (len >> 8) & 0xff;
  frame[2] = len & 0xff;
  frame[3] = command;
  frame.set(data, 4);
  frame[4 + data.length] = ETX;
  // LRC over bytes 1..ETX
  frame[5 + data.length - 1] = lrc(frame.slice(1, 4 + data.length + 1));
  return frame;
}

// ─── PAX command codes ────────────────────────────────────────────────────────

const PAX_CMD = {
  SALE:   0x01,
  VOID:   0x04,
  STATUS: 0x10,
  RESET:  0x11,
} as const;

// ─── Ingenico command codes ───────────────────────────────────────────────────

const INGENICO_CMD = {
  SALE:   0x30,
  VOID:   0x34,
  STATUS: 0x50,
} as const;

// ─── Serial port helpers ──────────────────────────────────────────────────────

async function openPort(baudRate: number): Promise<SerialPort> {
  if (!('serial' in navigator)) {
    throw new Error('Web Serial API not supported. Use Chrome 89+ or Edge 89+.');
  }
  const port = await (navigator as any).serial.requestPort({
    filters: [
      { usbVendorId: 0x0B00 }, // PAX Technology
      { usbVendorId: 0x0ACD }, // Ingenico
      { usbVendorId: 0x11CA }, // Verifone
    ],
  }) as SerialPort;
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
  return port;
}

async function writeToPort(port: SerialPort, data: Uint8Array): Promise<void> {
  const writer = port.writable!.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

async function readResponse(port: SerialPort, timeoutMs = 30000): Promise<Uint8Array> {
  const reader = port.readable!.getReader();
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((_, reject) =>
          setTimeout(() => reject(new Error('Card terminal timeout')), deadline - Date.now()),
        ),
      ]);
      if (done) break;
      if (value) {
        chunks.push(value);
        // Check if we have a complete frame (ends with ETX + LRC)
        const combined = mergeChunks(chunks);
        if (combined.length >= 5 && combined[combined.length - 2] === ETX) break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return mergeChunks(chunks);
}

function mergeChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseResponse(raw: Uint8Array, amountCents: number): CardPaymentResult {
  // Minimal TLV parse — extract response code (byte 4) and auth code (bytes 5-10)
  if (raw.length < 5) throw new Error('Invalid terminal response');

  const responseCode = raw[4].toString(16).padStart(2, '0').toUpperCase();
  const approved = responseCode === '00';

  // Extract ASCII fields from data payload (bytes 5 to ETX-2)
  const payload = raw.slice(5, raw.length - 2);
  const text = new TextDecoder().decode(payload);

  // PAX response fields are pipe-delimited: authCode|maskedPan|cardScheme|...
  const fields = text.split('|');
  const authCode   = fields[0]?.trim() || undefined;
  const maskedPan  = fields[1]?.trim() || undefined;
  const cardScheme = fields[2]?.trim() || undefined;

  return {
    approved,
    responseCode,
    authCode,
    maskedPan,
    cardScheme,
    amountCents,
    reference: authCode ?? `TXN-${Date.now()}`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _port: SerialPort | null = null;

/** Connect to a card terminal via Web Serial. Prompts the user to select a port. */
export async function connectCardTerminal(config: CardTerminalConfig): Promise<void> {
  const baudRate = config.baudRate ?? (config.brand === 'INGENICO' ? 9600 : 115200);
  _port = await openPort(baudRate);
}

/** Disconnect from the card terminal. */
export async function disconnectCardTerminal(): Promise<void> {
  if (_port) {
    try { await _port.close(); } catch { /* ignore */ }
    _port = null;
  }
}

/** Returns true if a port is currently open. */
export function isCardTerminalConnected(): boolean {
  return _port !== null;
}

/**
 * Initiate a sale on the connected card terminal.
 * The terminal will prompt the customer to tap/insert/swipe their card.
 */
export async function cardTerminalSale(
  amountCents: number,
  config: CardTerminalConfig,
): Promise<CardPaymentResult> {
  if (!_port) {
    _port = await openPort(config.baudRate ?? 115200);
  }

  // Encode amount as 12-digit ASCII cents (PAX format)
  const amountStr = amountCents.toString().padStart(12, '0');
  const encoder = new TextEncoder();
  const amountBytes = encoder.encode(amountStr);

  const cmd = config.brand === 'INGENICO' ? INGENICO_CMD.SALE : PAX_CMD.SALE;
  const frame = buildFrame(cmd, amountBytes);

  await writeToPort(_port, frame);
  const response = await readResponse(_port, 60000); // 60s for customer interaction
  return parseResponse(response, amountCents);
}

/**
 * Void the last transaction on the terminal.
 */
export async function cardTerminalVoid(config: CardTerminalConfig): Promise<void> {
  if (!_port) throw new Error('Card terminal not connected');
  const cmd = config.brand === 'INGENICO' ? INGENICO_CMD.VOID : PAX_CMD.VOID;
  const frame = buildFrame(cmd, new Uint8Array(0));
  await writeToPort(_port, frame);
  await readResponse(_port, 15000);
}

/** Check if Web Serial is available in this browser. */
export function isSerialAvailable(): boolean {
  return 'serial' in navigator;
}
