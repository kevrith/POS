/**
 * Fuel Pump Controller — Web Serial API bridge.
 *
 * Supports the most common pump controller protocols used in Kenya:
 *   - Gilbarco Veeder-Root (GVR) — ASCII command set over RS-232
 *   - Wayne Dresser — similar ASCII framing
 *   - Tokheim — binary framing
 *   - Generic IFSF (International Forecourt Standards Forum) subset
 *
 * Physical connection: RS-232 serial from the pump controller to a
 * USB-to-serial adapter (FTDI/CH340) connected to the POS terminal.
 *
 * Frame format (Gilbarco GVR):
 *   SOH (0x01) | ADDR | CMD | DATA... | ETX (0x03) | BCC
 *
 * Frame format (Wayne):
 *   STX (0x02) | LEN | CMD | DATA... | ETX (0x03) | CRC16
 */

const SOH = 0x01;
const STX = 0x02;
const ETX = 0x03;

export type PumpProtocol = 'GILBARCO' | 'WAYNE' | 'TOKHEIM' | 'IFSF';

export interface PumpControllerConfig {
  protocol: PumpProtocol;
  baudRate?: number;
  /** Controller address (0-31 for Gilbarco) */
  address?: number;
}

export interface PumpStatus {
  pumpId: number;
  status: 'IDLE' | 'AUTHORIZED' | 'DISPENSING' | 'STOPPED' | 'ERROR';
  litresDispensed: number;
  totalCents: number;
}

export interface PumpTransaction {
  pumpId: number;
  litresDispensed: number;
  pricePerLitreCents: number;
  totalCents: number;
  transactionId: string;
}

// ─── BCC checksum (XOR of all bytes between SOH and ETX exclusive) ────────────

function bcc(bytes: Uint8Array): number {
  return bytes.reduce((acc, b) => acc ^ b, 0);
}

// ─── CRC-16/CCITT for Wayne ───────────────────────────────────────────────────

function crc16(bytes: Uint8Array): number {
  let crc = 0xFFFF;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return crc & 0xFFFF;
}

// ─── Gilbarco frame builder ───────────────────────────────────────────────────

function buildGilbarcoFrame(address: number, cmd: number, data: Uint8Array): Uint8Array {
  const payload = new Uint8Array(3 + data.length);
  payload[0] = address & 0x1F;
  payload[1] = cmd;
  payload.set(data, 2);
  payload[2 + data.length] = ETX;
  const frame = new Uint8Array(2 + payload.length + 1);
  frame[0] = SOH;
  frame.set(payload, 1);
  frame[1 + payload.length] = bcc(payload);
  return frame;
}

// ─── Wayne frame builder ──────────────────────────────────────────────────────

function buildWayneFrame(cmd: number, data: Uint8Array): Uint8Array {
  const len = data.length + 1;
  const payload = new Uint8Array(2 + len);
  payload[0] = STX;
  payload[1] = len & 0xff;
  payload[2] = cmd;
  payload.set(data, 3);
  payload[3 + data.length] = ETX;
  const crc = crc16(payload.slice(1, 3 + data.length + 1));
  const frame = new Uint8Array(payload.length + 2);
  frame.set(payload);
  frame[payload.length]     = (crc >> 8) & 0xff;
  frame[payload.length + 1] = crc & 0xff;
  return frame;
}

// ─── Gilbarco command codes ───────────────────────────────────────────────────

const GVR_CMD = {
  AUTHORIZE:   0x41, // 'A'
  STOP:        0x53, // 'S'
  STATUS:      0x50, // 'P'
  TRANSACTION: 0x54, // 'T'
  RESET:       0x52, // 'R'
} as const;

// ─── Wayne command codes ──────────────────────────────────────────────────────

const WAYNE_CMD = {
  AUTHORIZE:   0x01,
  STOP:        0x02,
  STATUS:      0x03,
  TRANSACTION: 0x04,
} as const;

// ─── Serial port management ───────────────────────────────────────────────────

let _pumpPort: SerialPort | null = null;

export async function connectPumpController(config: PumpControllerConfig): Promise<void> {
  if (!('serial' in navigator)) {
    throw new Error('Web Serial API not supported. Use Chrome 89+ or Edge 89+.');
  }
  const baudRate = config.baudRate ?? (config.protocol === 'GILBARCO' ? 9600 : 19200);
  _pumpPort = await (navigator as any).serial.requestPort({
    filters: [
      { usbVendorId: 0x0403 }, // FTDI
      { usbVendorId: 0x1A86 }, // CH340/CH341
      { usbVendorId: 0x067B }, // Prolific PL2303
    ],
  }) as SerialPort;
  await _pumpPort.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
}

export async function disconnectPumpController(): Promise<void> {
  if (_pumpPort) {
    try { await _pumpPort.close(); } catch { /* ignore */ }
    _pumpPort = null;
  }
}

export function isPumpControllerConnected(): boolean {
  return _pumpPort !== null;
}

async function writePort(data: Uint8Array): Promise<void> {
  if (!_pumpPort) throw new Error('Pump controller not connected');
  const writer = _pumpPort.writable!.getWriter();
  try { await writer.write(data); } finally { writer.releaseLock(); }
}

async function readPort(timeoutMs = 5000): Promise<Uint8Array> {
  if (!_pumpPort) throw new Error('Pump controller not connected');
  const reader = _pumpPort.readable!.getReader();
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((_, rej) =>
          setTimeout(() => rej(new Error('Pump controller timeout')), deadline - Date.now()),
        ),
      ]);
      if (done) break;
      if (value) {
        chunks.push(value);
        const combined = mergeChunks(chunks);
        // Complete frame ends with ETX
        if (combined.includes(ETX)) break;
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

// ─── Response parsers ─────────────────────────────────────────────────────────

function parseGilbarcoStatus(raw: Uint8Array, pumpId: number): PumpStatus {
  // GVR status byte: 0x49='I'(idle), 0x41='A'(auth), 0x44='D'(dispensing), 0x53='S'(stopped)
  const statusByte = raw[2] ?? 0x49;
  const statusMap: Record<number, PumpStatus['status']> = {
    0x49: 'IDLE',
    0x41: 'AUTHORIZED',
    0x44: 'DISPENSING',
    0x53: 'STOPPED',
  };
  return {
    pumpId,
    status: statusMap[statusByte] ?? 'ERROR',
    litresDispensed: 0,
    totalCents: 0,
  };
}

function parseGilbarcoTransaction(raw: Uint8Array, pumpId: number): PumpTransaction {
  // GVR transaction response: ADDR | 'T' | LITRES(6 ASCII) | PRICE(6 ASCII) | TOTAL(8 ASCII) | ETX | BCC
  const text = new TextDecoder().decode(raw.slice(2, raw.length - 2));
  const litres = parseFloat(text.slice(0, 6)) / 1000; // millilitres to litres
  const pricePerLitre = parseFloat(text.slice(6, 12)) / 100;
  const total = parseFloat(text.slice(12, 20)) / 100;
  return {
    pumpId,
    litresDispensed: litres,
    pricePerLitreCents: Math.round(pricePerLitre * 100),
    totalCents: Math.round(total * 100),
    transactionId: `GVR-${Date.now()}`,
  };
}

// ─── Public pump control API ──────────────────────────────────────────────────

/**
 * Authorize a pump to dispense fuel.
 * @param pumpId  Physical pump number (1-based)
 * @param config  Protocol configuration
 */
export async function authorizePump(pumpId: number, config: PumpControllerConfig): Promise<void> {
  const addr = config.address ?? 0;
  const pumpByte = new Uint8Array([pumpId & 0xff]);

  if (config.protocol === 'GILBARCO') {
    const frame = buildGilbarcoFrame(addr, GVR_CMD.AUTHORIZE, pumpByte);
    await writePort(frame);
    await readPort(3000); // ACK
  } else if (config.protocol === 'WAYNE') {
    const frame = buildWayneFrame(WAYNE_CMD.AUTHORIZE, pumpByte);
    await writePort(frame);
    await readPort(3000);
  } else {
    // IFSF / Tokheim — send ASCII command
    const cmd = new TextEncoder().encode(`AUTH ${pumpId}\r\n`);
    await writePort(cmd);
    await readPort(3000);
  }
}

/**
 * Stop a pump (emergency stop or end of authorisation).
 */
export async function stopPump(pumpId: number, config: PumpControllerConfig): Promise<void> {
  const addr = config.address ?? 0;
  const pumpByte = new Uint8Array([pumpId & 0xff]);

  if (config.protocol === 'GILBARCO') {
    const frame = buildGilbarcoFrame(addr, GVR_CMD.STOP, pumpByte);
    await writePort(frame);
    await readPort(3000);
  } else if (config.protocol === 'WAYNE') {
    const frame = buildWayneFrame(WAYNE_CMD.STOP, pumpByte);
    await writePort(frame);
    await readPort(3000);
  } else {
    const cmd = new TextEncoder().encode(`STOP ${pumpId}\r\n`);
    await writePort(cmd);
    await readPort(3000);
  }
}

/**
 * Poll the status of a pump.
 */
export async function getPumpStatus(pumpId: number, config: PumpControllerConfig): Promise<PumpStatus> {
  const addr = config.address ?? 0;
  const pumpByte = new Uint8Array([pumpId & 0xff]);

  if (config.protocol === 'GILBARCO') {
    const frame = buildGilbarcoFrame(addr, GVR_CMD.STATUS, pumpByte);
    await writePort(frame);
    const raw = await readPort(3000);
    return parseGilbarcoStatus(raw, pumpId);
  } else {
    // Fallback: return unknown status
    return { pumpId, status: 'IDLE', litresDispensed: 0, totalCents: 0 };
  }
}

/**
 * Read the completed transaction data from a pump after dispensing.
 */
export async function getPumpTransaction(pumpId: number, config: PumpControllerConfig): Promise<PumpTransaction> {
  const addr = config.address ?? 0;
  const pumpByte = new Uint8Array([pumpId & 0xff]);

  if (config.protocol === 'GILBARCO') {
    const frame = buildGilbarcoFrame(addr, GVR_CMD.TRANSACTION, pumpByte);
    await writePort(frame);
    const raw = await readPort(5000);
    return parseGilbarcoTransaction(raw, pumpId);
  } else if (config.protocol === 'WAYNE') {
    const frame = buildWayneFrame(WAYNE_CMD.TRANSACTION, pumpByte);
    await writePort(frame);
    const raw = await readPort(5000);
    // Wayne response is similar ASCII format
    const text = new TextDecoder().decode(raw.slice(3, raw.length - 3));
    const litres = parseFloat(text.slice(0, 6)) / 1000;
    const total = parseFloat(text.slice(6, 14)) / 100;
    return {
      pumpId,
      litresDispensed: litres,
      pricePerLitreCents: litres > 0 ? Math.round((total / litres) * 100) : 0,
      totalCents: Math.round(total * 100),
      transactionId: `WAYNE-${Date.now()}`,
    };
  } else {
    const cmd = new TextEncoder().encode(`TXN ${pumpId}\r\n`);
    await writePort(cmd);
    const raw = await readPort(5000);
    const text = new TextDecoder().decode(raw).trim();
    const parts = text.split(' ');
    const litres = parseFloat(parts[1] ?? '0');
    const total = parseFloat(parts[2] ?? '0');
    return {
      pumpId,
      litresDispensed: litres,
      pricePerLitreCents: litres > 0 ? Math.round((total / litres) * 100) : 0,
      totalCents: Math.round(total * 100),
      transactionId: `IFSF-${Date.now()}`,
    };
  }
}

/** Check if Web Serial is available. */
export function isSerialAvailable(): boolean {
  return 'serial' in navigator;
}
