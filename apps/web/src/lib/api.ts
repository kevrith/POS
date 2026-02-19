const API_URL = import.meta.env.VITE_API_URL ?? '/api';

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
  if (stored) _accessToken = stored;
  return _accessToken;
}

export function clearToken(): void {
  _accessToken = '';
  sessionStorage.removeItem('pos-access-token');
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    clearToken();
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

export default api;
