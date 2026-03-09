const API_BASE = '/api/v1/super-admin';

let _token = '';

export function setAdminToken(token: string, email?: string) {
  _token = token;
  sessionStorage.setItem('admin-token', token);
  if (email) sessionStorage.setItem('admin-email', email);
}

export function getAdminToken(): string {
  if (_token) return _token;
  _token = sessionStorage.getItem('admin-token') ?? '';
  return _token;
}

export function getAdminEmail(): string {
  return sessionStorage.getItem('admin-email') ?? 'admin@kastrapos.co.ke';
}

export function clearAdminToken() {
  _token = '';
  sessionStorage.removeItem('admin-token');
  sessionStorage.removeItem('admin-email');
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearAdminToken();
    window.location.href = '/';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ token: string }>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getStats: () => request<any>('/stats'),

  getBusinesses: (page = 1, search?: string) =>
    request<any>(`/businesses?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),

  getRecentSignups: () => request<any[]>('/businesses/recent'),

  updateSubscription: (id: string, data: any) =>
    request<any>(`/businesses/${id}/subscription`, { method: 'PATCH', body: JSON.stringify(data) }),

  impersonate: (id: string) =>
    request<{ token: string; businessName: string; ownerEmail: string }>(`/businesses/${id}/impersonate`, { method: 'POST' }),

  getLicenseKeys: () => request<any>('/license-keys'),

  createLicenseKey: (tier: string, expiresAt?: string) =>
    request<any>('/license-keys', { method: 'POST', body: JSON.stringify({ tier, expiresAt }) }),

  createMachineBoundKey: (machineId: string, tier: string, expiresAt?: string) =>
    request<any>('/license-keys/machine-bound', { method: 'POST', body: JSON.stringify({ machineId, tier, expiresAt }) }),

  revokeKey: (id: string) =>
    request<any>(`/license-keys/${id}/revoke`, { method: 'PATCH' }),

  getHealth: () => request<any>('/health'),

  getBusinessData: (id: string) => request<any>(`/businesses/${id}/data`),

  triggerForceUpdate: (version: string, message: string, isRequired: boolean) =>
    request<any>('/force-update', { method: 'POST', body: JSON.stringify({ version, message, isRequired }) }),

  getReferrals: (page = 1) => request<any>(`/referrals?page=${page}&limit=20`),
};
