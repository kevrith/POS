// Run: node --test scripts/build-update-manifest.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest } from './build-update-manifest.mjs';

const V = '1.1.6';
const ALL = [
  `KASTRA.POS_${V}_x64-setup.exe`, `KASTRA.POS_${V}_amd64.AppImage`, `KASTRA.POS_${V}_amd64.deb`, `KASTRA.POS-${V}-1.x86_64.rpm`,
  'KASTRA.POS_x64.app.tar.gz', 'KASTRA.POS_aarch64.app.tar.gz',
];
const names = [...ALL, ...ALL.map((n) => `${n}.sig`), `KASTRA.POS_${V}_x64.dmg`, 'latest.json'];
const signatures = Object.fromEntries(ALL.map((n) => [n, `sig-of-${n}\n`]));
const base = { version: V, repo: 'kevrith/POS', tag: `desktop-v${V}`, names, signatures };

test('builds every platform the installed apps ask for, from the files on the release', () => {
  const m = buildManifest(base);
  assert.equal(m.version, V);
  for (const key of ['windows-x86_64', 'linux-x86_64', 'darwin-x86_64', 'darwin-aarch64']) assert.ok(m.platforms[key], key);
  assert.equal(m.platforms['windows-x86_64'].url, `https://github.com/kevrith/POS/releases/download/desktop-v${V}/KASTRA.POS_${V}_x64-setup.exe`);
  assert.equal(m.platforms['darwin-aarch64'].url.endsWith('/KASTRA.POS_aarch64.app.tar.gz'), true);
});

test('keeps the signature text exactly, without the trailing newline of the file', () => {
  const m = buildManifest(base);
  assert.equal(m.platforms['linux-x86_64'].signature, `sig-of-KASTRA.POS_${V}_amd64.AppImage`);
});

test('writes the same installer under both of its keys', () => {
  const m = buildManifest(base);
  assert.deepEqual(m.platforms['windows-x86_64'], m.platforms['windows-x86_64-nsis']);
  assert.deepEqual(m.platforms['darwin-x86_64'], m.platforms['darwin-x86_64-app']);
});

test('refuses, and says which, when a main platform is missing (the 1.1.6 failure: no Linux entry)', () => {
  const noLinux = names.filter((n) => !n.includes('AppImage'));
  assert.throws(() => buildManifest({ ...base, names: noLinux }), /linux-x86_64.*not on the release/s);
});

test('refuses a platform whose signature is missing or empty', () => {
  assert.throws(() => buildManifest({ ...base, signatures: { ...signatures, 'KASTRA.POS_x64.app.tar.gz': '  \n' } }), /darwin-x86_64.*no signature/s);
});

test('the extra Linux packages are optional', () => {
  const lean = names.filter((n) => !n.includes('.deb') && !n.includes('.rpm'));
  const m = buildManifest({ ...base, names: lean });
  assert.equal(m.platforms['linux-x86_64-deb'], undefined);
  assert.ok(m.platforms['linux-x86_64']);
});

test('refuses a version that is not x.y.z', () => {
  assert.throws(() => buildManifest({ ...base, version: 'latest' }), /x\.y\.z|1\.2\.3/);
});
