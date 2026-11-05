import * as fs from 'fs';
import * as path from 'path';

/**
 * Every API call the web app and the mobile apps make must have a route on the server.
 *
 * A client calling a route that does not exist fails at runtime with a 404 that only the one screen shows, and
 * nothing in the type-checker or the unit tests notices. Four such calls were found by hand (manager-PIN check,
 * removing an order line, the eTIMS settings page, Paystack initiate). This reads the controllers and the client
 * sources and compares them, so the next one fails here instead.
 */
const APPS = path.resolve(__dirname, '../../..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.expo', 'android', 'ios', 'build', 'src-tauri', 'coverage']);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

interface Route { method: string; path: string }

function serverRoutes(): Route[] {
  const routes: Route[] = [];
  for (const f of walk(path.join(APPS, 'api/src')).filter((x) => x.endsWith('.controller.ts'))) {
    const src = fs.readFileSync(f, 'utf8');
    const prefix = /@Controller\(\s*(?:\{[^}]*path:\s*)?['"`]([^'"`]*)['"`]/.exec(src)?.[1] ?? '';
    for (const m of src.matchAll(/@(Get|Post|Put|Patch|Delete|All)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)) {
      const full = ('/' + prefix + '/' + (m[2] ?? '')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      routes.push({ method: m[1].toUpperCase(), path: full });
    }
  }
  return routes;
}

/** Reads a string literal starting at `start` (the opening quote), handling `${...}` with nested template literals. */
function readLiteral(src: string, start: number): { value: string; end: number } | null {
  const quote = src[start];
  let i = start + 1;
  let value = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { value += src[i + 1] ?? ''; i += 2; continue; }
    if (c === quote) return { value, end: i + 1 };
    if (quote === '`' && c === '$' && src[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      value += '${}';
      i = j;
      continue;
    }
    if (quote !== '`' && c === '\n') return null;
    value += c;
    i++;
  }
  return null;
}

/** `/a/${}/b?x=${}` -> `/a/:p/b`. A `${}` glued to a word (`customers${}`) is a query suffix, so the path ends there. */
function toPattern(raw: string): string {
  let p = raw;
  const glued = p.search(/[^/]\$\{\}/);
  if (glued >= 0) p = p.slice(0, glued + 1);
  p = p.split('?')[0];
  return p.replace(/\$\{\}/g, ':p').replace(/\/+$/, '');
}

function segmentsMatch(route: string, call: string): boolean {
  const a = route.split('/');
  const b = call.split('/');
  return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || b[i] === ':p' || seg === b[i]);
}

interface ClientCall { app: string; method: string; path: string; file: string }

const CLIENT_CALL = /\b(?:api|mobileApi|driverApi|agentApi)\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*(?=[`'"])|\bapi(Get|Post|Patch|Put|Delete)(?:<[^>]*>)?\(\s*(?=[`'"])/g;

function clientCalls(): ClientCall[] {
  const apps: Array<[string, string]> = [
    ['web', 'web/src'], ['mobile-pos', 'mobile-pos'], ['mobile-customer', 'mobile-customer'],
    ['mobile-driver', 'mobile-driver'], ['mobile-agent', 'mobile-agent'],
  ];
  const calls: ClientCall[] = [];
  for (const [app, dir] of apps) {
    // tests make up their own paths (api.get('/a')); only real application code counts as a client call
    for (const f of walk(path.join(APPS, dir)).filter((x) => /\.(tsx?|jsx?)$/.test(x) && !/__tests__|\.test\.|\.spec\./.test(x))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(CLIENT_CALL)) {
        const lit = readLiteral(src, (m.index ?? 0) + m[0].length);
        if (!lit || !lit.value.startsWith('/')) continue;
        calls.push({ app, method: (m[1] ?? m[2]).toUpperCase(), path: toPattern(lit.value), file: path.relative(APPS, f) });
      }
    }
  }
  return calls;
}

describe('client calls match server routes', () => {
  const routes = serverRoutes();
  const calls = clientCalls();

  it('finds the routes and the calls it is meant to check', () => {
    expect(routes.length).toBeGreaterThan(500);
    expect(calls.filter((c) => c.app === 'web').length).toBeGreaterThan(400);
    for (const app of ['mobile-pos', 'mobile-customer', 'mobile-driver', 'mobile-agent']) {
      expect(calls.filter((c) => c.app === app).length).toBeGreaterThan(0);
    }
  });

  it('every web and mobile call has a route on the server', () => {
    const missing = calls
      .filter((c) => !routes.some((r) => (r.method === c.method || r.method === 'ALL') && segmentsMatch(r.path, c.path)))
      .map((c) => `${c.app}: ${c.method} ${c.path}  (${c.file})`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('reads nested template literals and query suffixes correctly', () => {
    const src = 'api.get(`/businesses/${id}/customers${search ? `?q=${encodeURIComponent(search)}` : \'\'}`)';
    const m = [...src.matchAll(CLIENT_CALL)][0];
    const lit = readLiteral(src, (m.index ?? 0) + m[0].length)!;
    expect(toPattern(lit.value)).toBe('/businesses/:p/customers');
    expect(toPattern('/business/${}/settings?x=${}')).toBe('/business/:p/settings');
  });
});

/**
 * Every place the web app navigates to must be a route that exists. `navigate('/sales')` when the route is
 * `/sales-list` sends the user to a blank page, and nothing else notices.
 */
describe('web navigation targets exist as routes', () => {
  const webSrc = path.join(APPS, 'web/src');
  const app = fs.readFileSync(path.join(webSrc, 'App.tsx'), 'utf8');
  const routePatterns = [...app.matchAll(/<Route\s+path="([^"*]+)"/g)].map((m) => m[1]);
  const matchesRoute = (target: string) =>
    routePatterns.some((r) => {
      const a = r.split('/').filter(Boolean);
      const b = target.split('/').filter(Boolean);
      return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || b[i] === ':p' || seg === b[i]);
    });

  const targets: Array<{ path: string; file: string }> = [];
  for (const f of walk(webSrc).filter((x) => /\.(tsx?)$/.test(x) && !x.includes('__tests__'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:navigate\(\s*|<Link\s[^>]*?to=\{?|<Navigate\s[^>]*?to=\{?|\bto:\s*)(['"`])(\/[^'"`]*)\1/g)) {
      const clean = m[2].split('?')[0].split('#')[0].replace(/\$\{[^}]*\}/g, ':p');
      if (clean === '/' || clean.includes('://')) continue;
      targets.push({ path: clean.replace(/\/+$/, ''), file: path.relative(APPS, f) });
    }
  }

  it('finds the routes and the targets it is meant to check', () => {
    expect(routePatterns.length).toBeGreaterThan(40);
    expect(targets.length).toBeGreaterThan(20);
  });

  it('every navigate / Link / nav-item target is a route', () => {
    const missing = targets.filter((t) => !matchesRoute(t.path)).map((t) => `${t.path}  (${t.file})`);
    expect([...new Set(missing)]).toEqual([]);
  });
});
