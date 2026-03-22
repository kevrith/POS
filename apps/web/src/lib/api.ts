/**
 * API base URL resolution order:
 *  1. localStorage 'kastra-server-url'  — set by desktop setup wizard (cloud or LAN server)
 *  2. VITE_API_URL env var              — set at build time for web deployment
 *  3. /api/v1                           — relative path (works via Vite proxy in dev)
 */
function resolveApiUrl(): string {
  try {
    const stored = localStorage.getItem('kastra-server-url');
    if (stored) return stored.replace(/\/$/, '') + '/api/v1';
  } catch { /* localStorage unavailable (kiosk/standalone context) */ }
  return import.meta.env.VITE_API_URL ?? '/api/v1';
}

const API_URL = resolveApiUrl();

// Token stored in memory (module-level) — NOT localStorage per security rules.
// sessionStorage is acceptable for tab-scoped persistence.
let _accessToken = '';

export function setToken(token: string): void {
  _accessToken = token;
  sessionStorage.setItem('pos-access-token', token);
}

export function getToken(): string {
  if (_accessToken) return _accessToken;
  // Restore from sessionStorage on page refresh
  const stored = sessionStorage.getItem('pos-access-token');
  if (stored) { _accessToken = stored; return _accessToken; }
  // Pick up token passed from a parent tab (kiosk new-tab handoff)
  const kioskToken = localStorage.getItem('kiosk-tab-token');
  if (kioskToken) {
    _accessToken = kioskToken;
    sessionStorage.setItem('pos-access-token', kioskToken);
    localStorage.removeItem('kiosk-tab-token'); // consume so it's not reused
  }
  return _accessToken;
}

export function clearToken(): void {
  _accessToken = '';
  sessionStorage.removeItem('pos-access-token');
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    clearToken();
    sessionStorage.removeItem('pos-auth'); // Clear Zustand persisted auth so reload shows login
    window.location.href = '/';
    throw new Error('Session expired');
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json() as { message?: string };
      message = body.message ?? message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function authHeaders(includeContentType = true): HeadersInit {
  const token = getToken();
  return {
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const api = {
  async get<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: authHeaders(false),
    });
    return handleResponse<T>(res);
  },

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: authHeaders(),
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(res);
  },

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<T>(res);
  },

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<T>(res);
  },

  async delete<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: authHeaders(false),
    });
    return handleResponse<T>(res);
  },
};

export async function openPdfReport(path: string): Promise<void> {
  // Fetch the HTML report with auth token, then open in a new tab as a Blob URL
  // (window.open directly would fail because the new tab has no JWT in sessionStorage)
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    console.error(`PDF report failed: ${res.status}`);
    return;
  }
  const html = await res.text();
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  // Revoke the blob URL after a delay so the new tab has time to load
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  if (!w) {
    // Popup blocked — fall back: create a hidden link and click it
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
  }
}

export default api;
