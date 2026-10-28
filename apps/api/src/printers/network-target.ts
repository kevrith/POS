import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * A network printer is a LAN device, so the address stored on a Printer row must
 * be a private IPv4 one. Anything else (loopback, link-local such as the cloud
 * metadata address, public hosts, IPv6) would turn the print endpoint into a way
 * to push bytes at arbitrary services from inside the server's network.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export interface NetworkTarget {
  host: string;
  port: number;
}

/** Parse `host[:port]` (default port 9100) and verify it resolves to a private IPv4 address. */
export async function resolvePrinterTarget(details: string): Promise<NetworkTarget> {
  const [host, portStr] = (details ?? '').trim().split(':');
  const port = portStr === undefined ? 9100 : Number(portStr);
  if (!host) throw new BadRequestException('Printer has no network address');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException('Printer port must be between 1 and 65535');
  }

  let address = host;
  if (!isIP(host)) {
    try {
      address = (await lookup(host, { family: 4 })).address;
    } catch {
      throw new BadRequestException(`Cannot resolve printer host "${host}"`);
    }
  }
  if (!isPrivateIPv4(address)) {
    throw new BadRequestException('Network printers must be on a private LAN address (10.x, 172.16-31.x or 192.168.x)');
  }
  return { host: address, port };
}
