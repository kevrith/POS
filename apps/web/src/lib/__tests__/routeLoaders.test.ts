import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(src, 'App.tsx'), 'utf8');
const loaders = fs.readFileSync(path.join(src, 'lib/routeLoaders.ts'), 'utf8');

const lazyPages = Object.fromEntries([...app.matchAll(/const (\w+) = lazy\(\(\) => import\('\.\/pages\/([A-Za-z0-9_]+)'\)\);/g)].map((m) => [m[1], m[2]]));
const lazyRoutes = [...app.matchAll(/<Route path="(\/[a-z0-9-]*)" element=\{<(\w+) \/>\}/g)].filter((m) => lazyPages[m[2]]).map((m) => ({ route: m[1], page: lazyPages[m[2]] }));
const listed = Object.fromEntries([...loaders.matchAll(/'(\/[a-z0-9-]*)': \(\) => import\('\.\.\/pages\/([A-Za-z0-9_]+)'\)/g)].map((m) => [m[1], m[2]]));

describe('routeLoaders matches App.tsx', () => {
  it('has found the routes it is meant to check', () => {
    expect(lazyRoutes.length).toBeGreaterThan(40);
  });

  it('lists every lazy route, pointing at the same page module (so a preload warms the page the route will use)', () => {
    const wrong = lazyRoutes.filter((r) => listed[r.route] !== r.page).map((r) => `${r.route} -> ${r.page} (listed: ${listed[r.route] ?? 'missing'})`);
    expect(wrong).toEqual([]);
  });

  it('lists nothing that is not a route', () => {
    const known = new Set(lazyRoutes.map((r) => r.route));
    expect(Object.keys(listed).filter((r) => !known.has(r))).toEqual([]);
  });
});
