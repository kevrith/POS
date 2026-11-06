import * as net from 'net';
import { findFreePort, isPortFree, waitForPort } from '../src/ports';

const listen = (port = 0) => new Promise<net.Server>((resolve) => { const s = net.createServer(); s.listen(port, '127.0.0.1', () => resolve(s)); });

describe('ports', () => {
  it('detects a busy port and skips it', async () => {
    const s = await listen();
    const busy = (s.address() as net.AddressInfo).port;
    expect(await isPortFree(busy)).toBe(false);
    expect(await findFreePort(busy)).toBeGreaterThan(busy);
    s.close();
  });
  it('waits for a server that starts late, and gives up on one that never does', async () => {
    const probe = await listen();
    const port = (probe.address() as net.AddressInfo).port;
    probe.close();
    let late: net.Server | undefined;
    setTimeout(() => void listen(port).then((s) => { late = s; }), 400);
    expect(await waitForPort(port, '127.0.0.1', 5000)).toBe(true);
    late?.close();
    expect(await waitForPort(1, '127.0.0.1', 600)).toBe(false);
  });
});
