import * as net from 'net';

/** Can we listen on this port right now? */
export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/** The first free port at or after `preferred`. */
export async function findFreePort(preferred: number, host = '127.0.0.1', tries = 50): Promise<number> {
  for (let i = 0; i < tries; i++) {
    if (await isPortFree(preferred + i, host)) return preferred + i;
  }
  throw new Error(`No free port found from ${preferred} to ${preferred + tries - 1}.`);
}

/** Wait until something accepts connections on host:port (used after starting a server process). */
export function waitForPort(port: number, host: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const s = net.connect(port, host);
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}
