#!/usr/bin/env node
/**
 * Makes the Ed25519 key pair that licences are signed and checked with. Run it ONCE, when you first set up licensing.
 *
 *   node apps/api/scripts/generate-license-keys.mjs --private-out <file> --public-out <file>
 *
 * - The PRIVATE key is written to the file you name (mode 600) and is never printed. Put its contents in the cloud server's
 *   environment as LICENSE_SIGNING_PRIVATE_KEY (Render), keep one safe copy elsewhere, then DELETE the file. Anyone who
 *   holds it can make licences. It must never go into git, an installer, or a chat.
 * - The PUBLIC key goes into the app. It is printed, and written to --public-out. Set it as the GitHub Actions variable
 *   LICENSE_PUBLIC_KEY (Settings → Secrets and variables → Actions → Variables) before building a release.
 *
 * Losing the private key means no new licences can be issued to apps that carry the old public key, so keep a copy.
 * Replacing the pair is a deliberate act: every installed app must be updated to carry the new public key.
 */
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const a = process.argv.slice(2);
const opt = (name) => { const i = a.indexOf(`--${name}`); return i >= 0 ? a[i + 1] : undefined; };
const privOut = opt('private-out');
const pubOut = opt('public-out');
if (!privOut || !pubOut) {
  console.error('Usage: node generate-license-keys.mjs --private-out <file> --public-out <file>');
  process.exit(2);
}
for (const f of [privOut, pubOut]) {
  if (fs.existsSync(f)) { console.error(`${f} already exists. Refusing to overwrite a key.`); process.exit(1); }
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
fs.mkdirSync(path.dirname(path.resolve(privOut)), { recursive: true });
fs.writeFileSync(privOut, privPem, { mode: 0o600 });
fs.writeFileSync(pubOut, pubPem);
console.log(`Private key written to ${privOut} (not shown). Put it in LICENSE_SIGNING_PRIVATE_KEY on the cloud server, keep a safe copy, then delete the file.`);
console.log(`Public key written to ${pubOut}. Set it as the GitHub variable LICENSE_PUBLIC_KEY:\n`);
console.log(pubPem);
