#!/usr/bin/env node
/**
 * Bump the version of the mobile apps.
 *
 *   node scripts/bump-mobile-version.mjs 1.1.0            # all four apps
 *   node scripts/bump-mobile-version.mjs 1.1.0 mobile-pos # just one
 *
 * Two numbers matter and they are not the same thing:
 *
 *   version      what people read ("1.1.0"). Also the OTA runtime key, because
 *                every app uses runtimeVersion policy "appVersion" — so bumping
 *                it deliberately cuts off updates to older installs, which is
 *                correct when native code changed and wrong when it did not.
 *
 *   versionCode  an Android integer that MUST increase for every Play Store
 *                upload, or the upload is rejected. Nothing reads it in-app.
 *
 * Neither should change per commit. To tell builds apart, read the commit shown
 * in App Info — that is what the build stamp is for.
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
  const expo = json.expo;

  const from = expo.version;
  expo.version = version;

  // versionCode only ever goes up; Play rejects a repeat or a decrease.
  expo.android = expo.android ?? {};
  const codeFrom = expo.android.versionCode ?? 0;
  expo.android.versionCode = codeFrom + 1;

  // iOS wants a string here, and the same rule about only increasing applies.
  if (expo.ios) {
    expo.ios.buildNumber = String(Number(expo.ios.buildNumber ?? 0) + 1);
  }

  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  console.log(
    `  ${app.padEnd(17)} ${from} → ${version}   versionCode ${codeFrom} → ${expo.android.versionCode}`,
  );
}

console.log(`
Next:
  1. Commit the bump so the version and the code that ships with it travel together.
  2. Rebuild — a version change is a new OTA runtime, so installs on the old
     version will no longer receive updates from this one. That is the point of
     bumping it; do not bump for a JavaScript-only fix you intend to ship by OTA.`);
