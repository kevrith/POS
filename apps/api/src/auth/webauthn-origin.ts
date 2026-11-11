import { BadRequestException } from '@nestjs/common';
import { configuredOrigins } from '../common/app-urls';

/**
 * The installed Windows desktop app's own address. Its web view is a secure context at a fixed, port-less host that only that
 * program can be at, so a passkey made there is bound to this RP ID and works only in the desktop app (a passkey made on the
 * website belongs to the website's host and cannot be used here, and the reverse). Each place registers its own.
 */
export const DESKTOP_RP_ID = 'tauri.localhost';
const DESKTOP_ORIGINS = ['http://tauri.localhost', 'https://tauri.localhost'];

export interface RelyingParty {
  /** The WebAuthn RP ID: the registrable domain the passkey is bound to. Never an IP address. */
  rpId: string;
  /** The exact origin the browser page runs on. */
  origin: string;
}

const isIp = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');

/** Pull the page origin out of the Origin header, or the Referer when the browser omitted Origin (same-origin GETs). */
export function pageOrigin(origin?: string, referer?: string): string | undefined {
  if (origin && origin !== 'null') return origin;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* fall through */
    }
  }
  return undefined;
}

/**
 * Decide the relying party for a WebAuthn ceremony from the page the request came from.
 *
 * The RP ID used to be the literal string 'localhost', so every real deployment failed with
 * "The relying party ID is not a registrable domain suffix of, nor equal to the current domain".
 * Browsers only accept an RP ID that is the page's own host (or a parent domain of it), and only on HTTPS
 * (http://localhost is the one exception). So we derive it from the page origin, after checking that origin is
 * one of ours, and let WEBAUTHN_RP_ID widen it to a parent domain (e.g. example.com for pos.example.com).
 */
export function resolveRelyingParty(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): RelyingParty {
  if (!origin) throw new BadRequestException('Cannot tell which site this request came from, so biometrics cannot be set up.');

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new BadRequestException('Invalid origin');
  }
  const host = url.hostname;
  const local = host === 'localhost';

  // The installed desktop app. It runs on plain http, which the rule below refuses for everyone else, and a configured
  // WEBAUTHN_RP_ID (a parent of the website's host) can never match it, so it is decided before both.
  if (DESKTOP_ORIGINS.includes(url.origin)) return { rpId: DESKTOP_RP_ID, origin: url.origin };
  if (url.protocol === 'tauri:') {
    throw new BadRequestException('Fingerprint / Face ID is not available in the macOS and Linux desktop app yet. Use your PIN, or open the website.');
  }

  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new BadRequestException(
      'Fingerprint / Face ID needs a secure (https) connection. Open the app through its https address instead of http or a LAN IP.',
    );
  }
  if (isIp(host)) {
    throw new BadRequestException(
      'Fingerprint / Face ID cannot work on an IP address. Open the app through its domain name (https).',
    );
  }

  const extra = (env.EXTRA_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const allowed =
    local ||
    configuredOrigins(env).includes(url.origin) ||
    extra.includes(url.origin) ||
    host.endsWith('.vercel.app');
  if (!allowed) throw new BadRequestException('This site is not allowed to register biometrics.');

  const configured = env.WEBAUTHN_RP_ID?.trim().toLowerCase();
  if (configured) {
    if (host !== configured && !host.endsWith(`.${configured}`)) {
      throw new BadRequestException('WEBAUTHN_RP_ID does not match the site you are using.');
    }
    return { rpId: configured, origin: url.origin };
  }
  return { rpId: host, origin: url.origin };
}
