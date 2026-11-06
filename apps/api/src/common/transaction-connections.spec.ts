import * as fs from 'fs';
import * as path from 'path';

/**
 * Inside `prisma.$transaction(async (tx) => ...)` every query must go through `tx`.
 *
 * `this.prisma.x` inside the callback uses a different connection from the one the transaction is holding. On a pool of one
 * (connection_limit=1, which the pgbouncer URL sets) the second query waits for a connection that cannot free up, times out
 * after 10 seconds and fails the request with a blank 500 ("Timed out fetching a new connection from the connection pool").
 * It passes every test on a default pool, so it only shows up in production. This reads the source and fails on it.
 */
const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** The text of each interactive-transaction callback in a file, with the line it starts on. */
function transactionBodies(src: string): Array<{ line: number; body: string }> {
  const out: Array<{ line: number; body: string }> = [];
  for (const m of src.matchAll(/\$transaction\(\s*async\s*\(\s*\w+/g)) {
    let depth = 1;
    let j = src.indexOf('(', m.index!) + 1;
    while (j < src.length && depth > 0) { if (src[j] === '(') depth++; else if (src[j] === ')') depth--; j++; }
    out.push({ line: src.slice(0, m.index).split('\n').length, body: src.slice(m.index!, j) });
  }
  return out;
}

describe('queries inside a transaction stay on its connection', () => {
  const files = sourceFiles(SRC);
  const bodies = files.flatMap((f) => transactionBodies(fs.readFileSync(f, 'utf8')).map((b) => ({ file: path.relative(SRC, f), ...b })));

  it('finds the transactions it is meant to check', () => {
    expect(bodies.length).toBeGreaterThan(20);
  });

  it('none of them uses `this.prisma` (a second connection)', () => {
    const bad = bodies.flatMap((b) =>
      [...b.body.matchAll(/this\.prisma\.\w+/g)].map((m) => `${b.file}:${b.line + b.body.slice(0, m.index).split('\n').length - 1}  ${m[0]}`),
    );
    expect(bad).toEqual([]);
  });

  it('every audit entry written inside a transaction is given the transaction client', () => {
    const bad = bodies.flatMap((b) => {
      const found: string[] = [];
      for (const m of b.body.matchAll(/this\.audit\.createEntry\(\{/g)) {
        // find the closing of this call and check it ends with `, tx)` (or whatever the callback's client is called)
        let depth = 1, j = m.index! + m[0].length;
        while (j < b.body.length && depth > 0) { const c = b.body[j]; if (c === '{') depth++; else if (c === '}') depth--; j++; }
        const tail = b.body.slice(j, j + 12);
        if (!/^\s*,\s*\w+\s*\)/.test(tail)) found.push(`${b.file}:${b.line + b.body.slice(0, m.index).split('\n').length - 1}`);
      }
      return found;
    });
    expect(bad).toEqual([]);
  });
});
