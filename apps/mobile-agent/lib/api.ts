import * as SecureStore from 'expo-secure-store';

export const SERVER_URL_KEY = 'agent_server_url';
// Same deployed API the web app uses (apps/web/vercel.json proxies /api here).
export const DEFAULT_BASE_URL = 'https://pos-bhe5.onrender.com/api/v1';

export async function getBaseUrl(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(SERVER_URL_KEY);
    return stored ?? DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('agent_token');
  } catch {
    return null;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const [baseUrl, token] = await Promise.all([getBaseUrl(), getToken()]);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const agentApi = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** RN fetch fails with the opaque "Network request failed" — translate it. */
export function friendlyError(e: unknown, fallback: string): string {
  const msg = (e as Error)?.message ?? '';
  if (msg.includes('Network request failed')) {
    return 'Could not reach the server. Check your internet connection, or if using a LAN server make sure this phone is on the same Wi-Fi.';
  }
  return msg || fallback;
}

export function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
