/**
 * Google sign-in for the Tauri desktop app.
 *
 * The popup flow from @react-oauth/google cannot work inside the desktop webview
 * (no popup handoff, and http://tauri.localhost is not an allowed Google origin).
 * Instead the consent page opens in the system browser, Rust catches the redirect on
 * a loopback port, and the API swaps the authorization code for a Google access token
 * (it holds the client secret). The result is used exactly like a token from the web flow.
 */
import { getApiUrl } from './api';

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function tauriInvoke(): Invoke | null {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: Invoke };
    __TAURI__?: { invoke?: Invoke };
  };
  return w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.invoke ?? null;
}

export function isDesktopApp(): boolean {
  return tauriInvoke() !== null;
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, init);
  const data = await res.json().catch(() => ({})) as T & { message?: string };
  if (!res.ok) throw new Error(data.message ?? 'Google sign-in failed');
  return data;
}

/** Runs the full browser round-trip and resolves to a Google access token. */
export async function getDesktopGoogleAccessToken(): Promise<string> {
  const invoke = tauriInvoke();
  if (!invoke) throw new Error('Google sign-in from the desktop app is only available in the installed app');

  const { clientId } = await apiJson<{ clientId: string }>('/auth/google/desktop-config');

  const codeVerifier = randomString(48);
  const state = randomString(16);
  const challenge = base64Url(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)),
  ));

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  });
  // URLSearchParams would encode the placeholder's underscores fine, but Rust needs the
  // redirect URI percent-encoded once its port is known, so append it unencoded.
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}&redirect_uri=__REDIRECT_URI__`;

  const result = await invoke<{
    code: string | null; state: string | null; error: string | null; redirect_uri: string;
  }>('oauth_browser_login', { authUrl });

  if (result.error) {
    throw new Error(result.error === 'access_denied' ? 'Google sign-in was cancelled' : `Google sign-in failed (${result.error})`);
  }
  if (!result.code || result.state !== state) throw new Error('Google sign-in failed. Please try again.');

  const { accessToken } = await apiJson<{ accessToken: string }>('/auth/google/desktop-exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: result.code, codeVerifier, redirectUri: result.redirect_uri }),
  });
  return accessToken;
}
