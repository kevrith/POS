/**
 * Printer settings for the cashier app: shape, defaults and validation.
 * Pure TypeScript (storage lives in receiptPrint.ts).
 */
import type { PaperWidth } from './receiptModel';

export type PrintMethod = 'system' | 'bluetooth' | 'network';

export interface PrinterSettings {
  /** Master switch: when off no print button is shown. Off by default, most mobile selling has no printer. */
  enabled: boolean;
  method: PrintMethod;
  /** 58 for small Bluetooth printers, 80 for standard thermal printers. */
  paperWidth: PaperWidth;
  /** Print as soon as a sale completes, with no tap. */
  autoPrint: boolean;
  bluetooth?: { address: string; name: string };
  network?: { host: string; port: number };
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  enabled: false,
  method: 'system',
  paperWidth: 58,
  autoPrint: false,
};

export const DEFAULT_NETWORK_PORT = 9100;

const METHODS: PrintMethod[] = ['system', 'bluetooth', 'network'];

export function isValidHost(host: string): boolean {
  const h = host.trim();
  if (!h || h.length > 253) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) return ipv4.slice(1).every((p) => Number(p) <= 255);
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(h);
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Defensive parse of whatever is in storage; anything unexpected falls back to the default. */
export function normalizeSettings(raw: unknown): PrinterSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRINTER_SETTINGS };
  const r = raw as Record<string, unknown>;
  const bt = r.bluetooth as { address?: unknown; name?: unknown } | undefined;
  const net = r.network as { host?: unknown; port?: unknown } | undefined;
  return {
    enabled: r.enabled === true,
    method: METHODS.includes(r.method as PrintMethod) ? (r.method as PrintMethod) : 'system',
    paperWidth: r.paperWidth === 80 ? 80 : 58,
    autoPrint: r.autoPrint === true,
    bluetooth: bt && typeof bt.address === 'string' && bt.address
      ? { address: bt.address, name: typeof bt.name === 'string' && bt.name ? bt.name : bt.address }
      : undefined,
    network: net && typeof net.host === 'string' && isValidHost(net.host)
      ? { host: net.host.trim(), port: isValidPort(Number(net.port)) ? Number(net.port) : DEFAULT_NETWORK_PORT }
      : undefined,
  };
}

/** Why the chosen method cannot print yet, or null when it is ready. */
export function configProblem(s: PrinterSettings): string | null {
  if (s.method === 'bluetooth' && !s.bluetooth) return 'Choose a Bluetooth printer in Settings first.';
  if (s.method === 'network' && !s.network) return 'Enter the printer address in Settings first.';
  return null;
}
