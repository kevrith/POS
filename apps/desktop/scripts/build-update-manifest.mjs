#!/usr/bin/env node
// Build the update manifest (latest.json) that installed apps read, from the files of one release.
//
// tauri-action also writes a latest.json, but each of the four platform builds edits the SAME file at the same moment, and a
// re-run of one build can overwrite the others' entries (the 1.1.6 release lost its Linux entry that way). The signatures are
// plain files on the release, so the manifest is built here, once, after every build has finished, and it cannot depend on
// four jobs not colliding.
//
//   node scripts/build-update-manifest.mjs --version 1.1.6 --repo owner/name --tag desktop-v1.1.6 \
//        --names names.txt --sigs sig-dir [--notes notes.md] --out latest.json
//   (names.txt: one release asset name per line; sig-dir: the downloaded *.sig files)
//
// Exits non-zero, writing nothing, if any of the four main platforms lacks its installer or signature.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The installer each platform updates from, and the extra keys tauri-action also writes (kept for the same lookups). */
export function platformFiles(version) {
  const v = version;
  return [
    { keys: ['windows-x86_64', 'windows-x86_64-nsis'], file: `KASTRA.POS_${v}_x64-setup.exe`, required: true },
    { keys: ['linux-x86_64', 'linux-x86_64-appimage'], file: `KASTRA.POS_${v}_amd64.AppImage`, required: true },
    { keys: ['linux-x86_64-deb'], file: `KASTRA.POS_${v}_amd64.deb`, required: false },
    { keys: ['linux-x86_64-rpm'], file: `KASTRA.POS-${v}-1.x86_64.rpm`, required: false },
    { keys: ['darwin-x86_64', 'darwin-x86_64-app'], file: 'KASTRA.POS_x64.app.tar.gz', required: true },
    { keys: ['darwin-aarch64', 'darwin-aarch64-app'], file: 'KASTRA.POS_aarch64.app.tar.gz', required: true },
  ];
}

/**
 * @param {{ version: string, repo: string, tag: string, names: string[], signatures: Record<string, string>, notes?: string, pubDate?: string }} o
 * `signatures` maps an asset name to the text of its .sig file.
 */
export function buildManifest(o) {
  if (!/^\d+\.\d+\.\d+$/.test(o.version)) throw new Error(`version must look like 1.2.3, got "${o.version}"`);
  const have = new Set(o.names);
  const platforms = {};
  const missing = [];
  for (const p of platformFiles(o.version)) {
    const sig = (o.signatures[p.file] ?? '').trim();
    if (!have.has(p.file) || !sig) {
      if (p.required) missing.push(`${p.keys[0]}: ${p.file}${have.has(p.file) ? ' (no signature)' : ' (not on the release)'}`);
      continue;
    }
    const entry = { signature: sig, url: `https://github.com/${o.repo}/releases/download/${o.tag}/${p.file}` };
    for (const key of p.keys) platforms[key] = entry;
  }
  if (missing.length > 0) throw new Error(`The release is incomplete, so no manifest was written:\n  ${missing.join('\n  ')}`);
  return { version: o.version, notes: o.notes ?? '', pub_date: o.pubDate ?? new Date().toISOString(), platforms };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = args(process.argv.slice(2));
  for (const need of ['version', 'repo', 'tag', 'names', 'sigs', 'out']) {
    if (!a[need]) { console.error(`missing --${need}`); process.exit(2); }
  }
  const names = readFileSync(a.names, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const signatures = {};
  for (const name of names.filter((n) => n.endsWith('.sig'))) signatures[name.slice(0, -4)] = readFileSync(join(a.sigs, name), 'utf8');
  try {
    const manifest = buildManifest({
      version: a.version, repo: a.repo, tag: a.tag, names, signatures,
      notes: a.notes ? readFileSync(a.notes, 'utf8') : '',
    });
    writeFileSync(a.out, JSON.stringify(manifest, null, 2));
    console.log(`manifest ok: ${manifest.version}, ${Object.keys(manifest.platforms).join(', ')}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
