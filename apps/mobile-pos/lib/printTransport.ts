/**
 * Native print transports. Native modules are loaded lazily inside each call:
 * a binary built before these modules existed (the app also receives OTA updates)
 * must keep starting, and only fail with a readable message when printing.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import * as Print from 'expo-print';
import { bytesToBase64 } from './escpos';
import { receiptHtml } from './receiptHtml';
import type { PrintTransports } from './printDispatch';

const NATIVE_MISSING = 'This build of the app does not include printer support yet. Install the latest version of the app.';

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadBluetooth(): any {
  try {
    return require('react-native-bluetooth-classic').default;
  } catch {
    throw new Error(NATIVE_MISSING);
  }
}

function loadTcp(): any {
  try {
    return require('react-native-tcp-socket').default;
  } catch {
    throw new Error(NATIVE_MISSING);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function ensureBluetoothReady(bt: ReturnType<typeof loadBluetooth>): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Bluetooth printers work on Android only. On iPhone use a network printer or the system print dialog.');
  }
  if (Number(Platform.Version) >= 31) {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Allow the Nearby devices permission for this app to use a Bluetooth printer.');
    }
  }
  if (!(await bt.isBluetoothEnabled())) {
    const on = await bt.requestBluetoothEnabled().catch(() => false);
    if (!on) throw new Error('Bluetooth is switched off. Turn it on and try again.');
  }
}

/** Printers already paired in Android Bluetooth settings. */
export async function listBondedPrinters(): Promise<Array<{ name: string; address: string }>> {
  const bt = loadBluetooth();
  await ensureBluetoothReady(bt);
  const devices: Array<{ name?: string; address: string }> = await bt.getBondedDevices();
  return devices.map((d) => ({ name: d.name || d.address, address: d.address }));
}

// Printers have small receive buffers; large writes are dropped or garbled.
const BT_CHUNK = 512;
const BT_CHUNK_DELAY_MS = 25;

async function writeBluetooth(bt: ReturnType<typeof loadBluetooth>, address: string, bytes: Uint8Array): Promise<void> {
  for (let i = 0; i < bytes.length; i += BT_CHUNK) {
    await bt.writeToDevice(address, bytesToBase64(bytes.subarray(i, i + BT_CHUNK)), 'base64');
    await sleep(BT_CHUNK_DELAY_MS);
  }
}

async function sendBluetooth(address: string, bytes: Uint8Array): Promise<void> {
  const bt = loadBluetooth();
  await ensureBluetoothReady(bt);

  const connect = async () => {
    try {
      await bt.connectToDevice(address, { delimiter: '' });
    } catch {
      throw new Error('Could not connect to the printer. Check it is switched on, in range and paired in Bluetooth settings.');
    }
  };

  if (!(await bt.isDeviceConnected(address))) await connect();
  try {
    await writeBluetooth(bt, address, bytes);
  } catch {
    // A connection left over from earlier often went stale (printer slept or moved away): reconnect once.
    await bt.disconnectFromDevice(address).catch(() => undefined);
    await connect();
    try {
      await writeBluetooth(bt, address, bytes);
    } catch {
      throw new Error('The printer stopped responding while printing. Check its paper and battery, then try again.');
    }
  }
}

const NETWORK_TIMEOUT_MS = 6000;

function sendNetwork(host: string, port: number, bytes: Uint8Array): Promise<void> {
  const TcpSocket = loadTcp();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch { /* already closed */ }
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error(`The printer at ${host}:${port} did not answer. Check it is on the same Wi-Fi network.`)),
      NETWORK_TIMEOUT_MS,
    );
    const socket = TcpSocket.createConnection({ host, port }, () => {
      socket.write(bytes, undefined, (err?: Error) => {
        // Give the printer a moment to take the data before closing the connection.
        if (err) finish(new Error(`Could not send to the printer at ${host}:${port}.`));
        else setTimeout(() => finish(), 150);
      });
    });
    socket.on('error', () => finish(new Error(`Could not reach the printer at ${host}:${port}. Check the address and the Wi-Fi network.`)));
  });
}

async function printSystem(receipt: Parameters<PrintTransports['printSystem']>[0], paperWidth: Parameters<PrintTransports['printSystem']>[1]): Promise<void> {
  await Print.printAsync({ html: receiptHtml(receipt, paperWidth) });
}

async function printSystemHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

export const nativeTransports: PrintTransports = { sendBluetooth, sendNetwork, printSystem, printSystemHtml };
