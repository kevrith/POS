#!/usr/bin/env node
/**
 * Set the version of the mobile apps.
 *
 *   node scripts/bump-mobile-version.mjs 1.1.0            # all four apps
 *   node scripts/bump-mobile-version.mjs 1.1.0 mobile-pos # just one
 *
 * Only `version` is set here. versionCode and iOS buildNumber are owned by EAS
 * (`appVersionSource: "remote"` with `autoIncrement`), so they are deliberately
 * absent from app.json — a number sitting in a file that nothing reads is how
 * people end up debugging the wrong thing.
 *
 * `version` is a release marker, not a build identifier. It is also the OTA
 * runtime key, since every app uses runtimeVersion policy "appVersion": bumping
 * it cuts existing installs off from updates published against the old version.
 * Bump it when native code or config changed and a rebuild is going out anyway.
 * Do not bump it for a JavaScript fix you intend to ship with `eas update`.
 *
 * To tell two builds apart, read the commit in the app's App Info screen.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = ['mobile-pos', 'mobile-customer', 'mobile-driver', 'mobile-agent'];

const [, , version, ...only] = process.argv;

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/bump-mobile-version.mjs <x.y.z> [app ...]');
  console.error('Example: node scripts/bump-mobile-version.mjs 1.1.0');
  process.exit(1);
}

const apps = only.length ? only : ALL;
const unknown = apps.filter((a) => !ALL.includes(a));
if (unknown.length) {
  console.error(`Unknown app(s): ${unknown.join(', ')}`);
  console.error(`Known: ${ALL.join(', ')}`);
  process.exit(1);
}

for (const app of apps) {
  const path = join(ROOT, 'apps', app, 'app.json');
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const from = json.expo.version;
  json.expo.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`  ${app.padEnd(17)} ${from} → ${version}`);
}

console.log(`
Next:
  1. Commit the bump, so the version and the code it ships with travel together.
  2. Rebuild. EAS assigns the next versionCode itself.

Existing installs on the old version stop receiving OTA updates published
against this one — that is the point of a version bump, and the reason not to
do it for a JavaScript-only change.`);
