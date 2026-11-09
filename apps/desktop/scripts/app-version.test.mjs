// Run: node --test scripts/app-version.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { problem, readVersions, setVersion } from './app-version.mjs';

/** The real four files, held in memory so a test never edits them. */
function fakeDisk() {
  const disk = new Map();
  const read = (f) => {
    if (!disk.has(f)) disk.set(f, readFileSync(f, 'utf8'));
    return disk.get(f);
  };
  return { read, write: (f, s) => disk.set(f, s) };
}

test('the four real files agree today', () => {
  assert.equal(problem(readVersions(), undefined), null);
});

test('setting a version changes all four files', () => {
  const d = fakeDisk();
  setVersion('9.8.7', d.read, d.write);
  assert.deepEqual(readVersions(d.read), { tauri: '9.8.7', cargo: '9.8.7', lock: '9.8.7', npm: '9.8.7' });
});

test('only the app package is changed in Cargo.lock, not other crates', () => {
  const d = fakeDisk();
  setVersion('9.8.7', d.read, d.write);
  const lock = d.read(new URL('../src-tauri/Cargo.lock', import.meta.url).pathname);
  assert.equal((lock.match(/version = "9\.8\.7"/g) ?? []).length, 1);
});

test('a bad version is refused before anything is written', () => {
  const d = fakeDisk();
  let wrote = false;
  assert.throws(() => setVersion('one.two', d.read, () => (wrote = true)), /not a version/);
  assert.equal(wrote, false);
});

test('disagreeing files and a wrong tag are reported in plain words', () => {
  assert.match(problem({ tauri: '1.0.0', cargo: '1.0.1', lock: '1.0.0', npm: '1.0.0' }), /differs between files/);
  assert.match(problem({ tauri: '1.2.0', cargo: '1.2.0', lock: '1.2.0', npm: '1.2.0' }, 'desktop-v1.1.0'), /expected tag desktop-v1\.2\.0/);
  assert.equal(problem({ tauri: '1.2.0', cargo: '1.2.0', lock: '1.2.0', npm: '1.2.0' }, 'desktop-v1.2.0'), null);
  assert.match(problem({ tauri: undefined, cargo: undefined, lock: undefined, npm: undefined }), /differs|missing/);
});
