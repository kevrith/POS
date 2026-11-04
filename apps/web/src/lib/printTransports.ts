// Raw ESC/POS transports: USB (WebUSB), Bluetooth (Web Bluetooth) and LAN (through the API).
// Every one ends up as "write these bytes to the printer".

import api from './api';
import { bytesToBase64, chunkBytes } from '@pos/print-core';

// A printer is paired once from Settings -> Printers; after that a sale prints
// without any picker. Browsers only allow a device chooser during a user
// gesture, so the paired device is looked up silently (getDevices) at print time.

export interface PairedPrinter { id?: string; vendorId?: number; productId?: number; name: string }

const USB_PAIRED_KEY = 'usb-printer';
const BT_PAIRED_KEY = 'bt-printer';

function readPaired(key: string): PairedPrinter | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as PairedPrinter) : null; } catch { return null; }
}
function writePaired(key: string, value: PairedPrinter): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const getPairedUsbPrinter = () => readPaired(USB_PAIRED_KEY);
export const getPairedBluetoothPrinter = () => readPaired(BT_PAIRED_KEY);

// ---- USB (WebUSB: Chrome, Edge, Android Chrome)

const USB_FILTERS = [{ classCode: 7 }, { classCode: 255 }]; // printer class, vendor-specific

/* eslint-disable @typescript-eslint/no-explicit-any */
function usbApi(): any {
  const usb = (navigator as any).usb;
  if (!usb) throw new Error('This browser cannot talk to USB printers (WebUSB). Use Chrome or Edge, or choose a network printer.');
  return usb;
}

/** Ask the user to pick a USB printer and remember it. Must run from a click. */
export async function pairUsbPrinter(): Promise<PairedPrinter> {
  const device = await usbApi().requestDevice({ filters: USB_FILTERS });
  const paired: PairedPrinter = {
    vendorId: device.vendorId,
    productId: device.productId,
    name: device.productName || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`,
  };
  writePaired(USB_PAIRED_KEY, paired);
  return paired;
}

async function findUsbDevice(): Promise<any> {
  const usb = usbApi();
  const paired = getPairedUsbPrinter();
  const granted: any[] = await usb.getDevices();
  const match = paired
    ? granted.find((d) => d.vendorId === paired.vendorId && d.productId === paired.productId)
    : granted.length === 1 ? granted[0] : undefined;
  if (match) return match;
  try {
    // Only succeeds while a click is still being handled (manual "Print" buttons).
    return await usb.requestDevice({ filters: USB_FILTERS });
  } catch {
    throw new Error('No USB printer is paired on this device. Open Settings -> Printers and pair it.');
  }
}

/** Send raw bytes to the paired USB printer. */
export async function printRawUSB(bytes: Uint8Array): Promise<void> {
  await writeToUsbDevice(await findUsbDevice(), bytes);
}

/** Ask the user to pick any USB printer by vendor and send it bytes once (labels). Must run from a click. */
export async function printRawUSBPicked(bytes: Uint8Array, vendorId?: number): Promise<void> {
  const filters = vendorId === undefined ? USB_FILTERS : [{ vendorId }];
  await writeToUsbDevice(await usbApi().requestDevice({ filters }), bytes);
}

/** Open the device, find its bulk OUT endpoint instead of assuming one, and write. */
async function writeToUsbDevice(device: any, bytes: Uint8Array): Promise<void> {
  await device.open();
  try {
    if (device.configuration === null) await device.selectConfiguration(1);
    const candidates: Array<{ iface: any; alt: any; ep: any }> = [];
    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        const ep = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk');
        if (ep) candidates.push({ iface, alt, ep });
      }
    }
    candidates.sort((a, b) => Number(b.alt.interfaceClass === 7) - Number(a.alt.interfaceClass === 7));
    const target = candidates[0];
    if (!target) throw new Error('This USB device has no writable endpoint, so it is not a printer.');
    await device.claimInterface(target.iface.interfaceNumber);
    try {
      if (target.alt.alternateSetting) await device.selectAlternateInterface(target.iface.interfaceNumber, target.alt.alternateSetting);
      for (const chunk of chunkBytes(bytes, 4096)) await device.transferOut(target.ep.endpointNumber, chunk);
    } finally {
      await device.releaseInterface(target.iface.interfaceNumber).catch(() => undefined);
    }
  } finally {
    await device.close().catch(() => undefined);
  }
}

// ---- Bluetooth (Web Bluetooth: Chrome, Edge, Android Chrome; not iOS Safari)

// GATT services that cheap and branded BLE thermal printers expose for raw data.
const BT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];

let btDevice: any = null; // Kept for the page lifetime: a reload needs getDevices() or a re-pair.

function btApi(): any {
  const bt = (navigator as any).bluetooth;
  if (!bt) throw new Error('This browser cannot talk to Bluetooth printers. Use Chrome or Edge on Android or desktop, or choose a network printer.');
  return bt;
}

/** Ask the user to pick a Bluetooth printer and remember it. Must run from a click. */
export async function pairBluetoothPrinter(): Promise<PairedPrinter> {
  const device = await btApi().requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  btDevice = device;
  const paired: PairedPrinter = { id: device.id, name: device.name || 'Bluetooth printer' };
  writePaired(BT_PAIRED_KEY, paired);
  return paired;
}

async function findBluetoothDevice(): Promise<any> {
  if (btDevice) return btDevice;
  const bt = btApi();
  const paired = getPairedBluetoothPrinter();
  if (paired?.id && typeof bt.getDevices === 'function') {
    const known: any[] = await bt.getDevices();
    const match = known.find((d) => d.id === paired.id);
    if (match) { btDevice = match; return match; }
  }
  try {
    btDevice = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
    return btDevice;
  } catch {
    throw new Error('Bluetooth printer is not connected. Open Settings -> Printers and pair it again.');
  }
}

async function findWritableCharacteristic(server: any): Promise<any> {
  const services: any[] = await server.getPrimaryServices();
  services.sort((a, b) => BT_SERVICES.indexOf(a.uuid) - BT_SERVICES.indexOf(b.uuid) || 0);
  for (const service of services) {
    const characteristics: any[] = await service.getCharacteristics();
    const writable = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  throw new Error('The Bluetooth device has no writable channel, so it is not a supported printer.');
}

export async function printRawBluetooth(bytes: Uint8Array): Promise<void> {
  const device = await findBluetoothDevice();
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);
  // BLE writes are limited by the negotiated MTU; 100 bytes is safe on every stack.
  for (const chunk of chunkBytes(bytes, 100)) {
    if (characteristic.properties.writeWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
    else await characteristic.writeValue(chunk);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- LAN printer reached through the API (the API host must be on the same LAN as the printer)

export async function printRawNetwork(printerId: string, bytes: Uint8Array): Promise<void> {
  await api.post(`/printers/${printerId}/print`, { data: bytesToBase64(bytes) });
}
