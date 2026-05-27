import * as SecureStore from 'expo-secure-store';

export const SERVER_URL_KEY  = 'driver_server_url';
export const DEFAULT_BASE_URL = 'https://api.kastra.co.ke/api/v1';

export async function getBaseUrl(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(SERVER_URL_KEY);
    return stored ?? DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('driver_token');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const [baseUrl, token] = await Promise.all([getBaseUrl(), getToken()]);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const driverApi = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)   => request<T>('POST',   path, body),
  patch:  <T>(path: string, body: unknown)   => request<T>('PATCH',  path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
};

export function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
