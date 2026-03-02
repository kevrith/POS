/**
 * Web Serial API — Scale Integration
 * Supports Mettler-Toledo (MT-SICS), A&D, CAS, and Ohaus protocols.
 * Chrome 89+ / Edge 89+ only (requires HTTPS or localhost).
 */

// Web Serial API types (not yet in standard DOM lib)
interface SerialPort {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

export type ScaleProtocol = 'METTLER_TOLEDO' | 'AND' | 'CAS' | 'OHAUS';

export interface ScaleReading {
  weightGrams: number;
  stable: boolean;
  unit: string;
}

/** Check if Web Serial API is available in this browser */
export function isSerialSupported(): boolean {
  return 'serial' in navigator;
}

/**
 * Request a scale port from the user (browser permission dialog).
 * Returns the SerialPort or throws if denied / unsupported.
 */
export async function requestScalePort(): Promise<SerialPort> {
  if (!isSerialSupported()) {
    throw new Error('Web Serial API is not supported in this browser. Use Chrome 89+ or Edge 89+.');
  }
  return (navigator as any).serial.requestPort({ filters: [] });
}

/**
 * Read a single weight measurement from the scale.
 * Opens the port, sends the query command, reads the response, closes the port.
 */
export async function readWeight(
  port: SerialPort,
  protocol: ScaleProtocol = 'METTLER_TOLEDO',
  baudRate = 9600,
): Promise<ScaleReading> {
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });

  try {
    const encoder = new TextEncoder();
    const writer = port.writable!.getWriter();
    const reader = port.readable!.getReader();

    // Send query command
    const command = getQueryCommand(protocol);
    await writer.write(encoder.encode(command));
    writer.releaseLock();

    // Read response with 3 second timeout
    const response = await readWithTimeout(reader, 3000);
    reader.releaseLock();

    return parseResponse(response, protocol);
  } finally {
    await port.close();
  }
}

function getQueryCommand(protocol: ScaleProtocol): string {
  switch (protocol) {
    case 'METTLER_TOLEDO': return 'S\r\n';   // MT-SICS: Send stable weight
    case 'AND':            return 'Q\r\n';   // A&D: Request weight
    case 'CAS':            return 'W\r\n';   // CAS: Weight request
    case 'OHAUS':          return 'IP\r\n';  // Ohaus: Print request
    default:               return 'S\r\n';
  }
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((_, reject) =>
        setTimeout(() => reject(new Error('Scale read timeout')), timeoutMs),
      ),
    ]);

    if (done) break;
    if (value) {
      buffer += decoder.decode(value);
      if (buffer.includes('\n') || buffer.includes('\r')) break;
    }
  }

  if (!buffer.trim()) throw new Error('No response from scale. Check cable and baud rate.');
  return buffer.trim();
}

function parseResponse(raw: string, protocol: ScaleProtocol): ScaleReading {
  // Mettler-Toledo MT-SICS: "S S     0.123 kg" or "S D     0.123 kg"
  if (protocol === 'METTLER_TOLEDO') {
    const match = raw.match(/^S\s+([SD])\s+([\d.]+)\s+(\w+)/);
    if (match) {
      const weightInUnit = parseFloat(match[2]);
      const unit = match[3];
      return {
        weightGrams: convertToGrams(weightInUnit, unit),
        stable: match[1] === 'S',
        unit,
      };
    }
  }

  // A&D: "+  0.123kg ST" or "?  0.123kg US"
  if (protocol === 'AND') {
    const match = raw.match(/([+-]?\s*[\d.]+)\s*(\w+)\s*(ST|US)?/);
    if (match) {
      const weight = parseFloat(match[1].replace(/\s/g, ''));
      const unit = match[2];
      return {
        weightGrams: convertToGrams(Math.abs(weight), unit),
        stable: match[3] === 'ST' || !match[3],
        unit,
      };
    }
  }

  // CAS / Ohaus / generic: look for a number followed by unit
  const genericMatch = raw.match(/([\d.]+)\s*(g|kg|lb|oz)/i);
  if (genericMatch) {
    const weight = parseFloat(genericMatch[1]);
    const unit = genericMatch[2].toLowerCase();
    return {
      weightGrams: convertToGrams(weight, unit),
      stable: true,
      unit,
    };
  }

  throw new Error(`Could not parse scale response: "${raw}"`);
}

function convertToGrams(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'kg':  return Math.round(value * 1000);
    case 'lb':  return Math.round(value * 453.592);
    case 'oz':  return Math.round(value * 28.3495);
    case 'g':   return Math.round(value);
    default:    return Math.round(value); // Assume grams
  }
}
