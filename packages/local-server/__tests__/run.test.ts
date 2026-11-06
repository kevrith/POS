import { run } from '../src/postgres';

describe('run() with a program that leaves a background process behind', () => {
  // `pg_ctl start` does exactly this on Windows: it exits, but the database it started keeps holding the output pipe. Waiting
  // for the pipe to close (Node's "close" event) then never ends, and the whole server hung at "Creating your database".
  it('returns when the program exits, not when a leftover child lets go of the pipe', async () => {
    const parent = `
      const { spawn } = require('child_process');
      spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { stdio: ['ignore', 'inherit', 'inherit'], detached: true }).unref();
      console.log('started');
    `;
    const t = Date.now();
    const r = await run(process.execPath, ['-e', parent], { timeoutMs: 20000 });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('started');
    expect(Date.now() - t).toBeLessThan(4000); // not the 8 seconds the leftover holds the pipe
  });

  it('still returns everything an ordinary program printed', async () => {
    const r = await run(process.execPath, ['-e', "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"]);
    expect(r).toEqual({ code: 3, stdout: 'out', stderr: 'err' });
  });
});
