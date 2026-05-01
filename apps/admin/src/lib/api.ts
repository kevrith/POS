// Strip any trailing /api/v1 from VITE_API_URL so it works whether the env var
// is set to the bare host (http://localhost:3010) or the full prefix (https://pos-bhe5.onrender.com/api/v1)
const _base = (import.meta.env.VITE_API_URL ?? 'http://localhost:3010').replace(/\/api\/v1\/?$/, '');
const API_BASE = `${_base}/api/v1/super-admin`;

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

  resendLicenseKey: (id: string) =>
    request<{ success: boolean; sentTo: string }>(`/license-keys/${id}/resend`, { method: 'POST' }),

  regenerateLicenseKey: (id: string) =>
    request<{ success: boolean; newKey: string; sentTo: string }>(`/license-keys/${id}/regenerate`, { method: 'POST' }),

  getHealth: () => request<any>('/health'),

  getBusinessData: (id: string) => request<any>(`/businesses/${id}/data`),

  triggerForceUpdate: (version: string, message: string, isRequired: boolean) =>
    request<any>('/force-update', { method: 'POST', body: JSON.stringify({ version, message, isRequired }) }),

  getReferrals: (page = 1) => request<any>(`/referrals?page=${page}&limit=20`),

  getBusinessUsers: (id: string) => request<any[]>(`/businesses/${id}/users`),

  resetUserPassword: (userId: string) =>
    request<{ tempPassword: string; email: string | null }>(`/users/${userId}/reset-password`, { method: 'POST' }),

  unlockUser: (userId: string) =>
    request<{ success: boolean; name: string }>(`/users/${userId}/unlock`, { method: 'POST' }),

  updateUser: (userId: string, data: { name?: string; role?: string; email?: string }) =>
    request<any>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listAllUsers: (page = 1, search?: string, role?: string) =>
    request<any>(`/users?page=${page}&limit=30${search ? `&search=${encodeURIComponent(search)}` : ''}${role && role !== 'ALL' ? `&role=${role}` : ''}`),

  deleteUser: (userId: string) =>
    request<any>(`/users/${userId}`, { method: 'DELETE' }),

  // ── Analytics ──────────────────────────────────────────────────────────
  getChurnAnalytics:      (from?: string, to?: string) => request<any>(`/analytics/churn${from ? `?from=${from}${to ? `&to=${to}` : ''}` : ''}`),
  getCohortAnalysis:      () => request<any>('/analytics/cohort'),
  getBusinessLTV:         (page = 1, sortBy = 'ltv') => request<any>(`/analytics/ltv?page=${page}&sortBy=${sortBy}`),
  getPaystackRevenue:     () => request<any>('/analytics/paystack-revenue'),
  getCollectedRevenue:    () => request<any>('/analytics/collected-revenue'),
  getTrialsExpiringSoon:  (days = 7) => request<any>(`/analytics/trials-expiring?days=${days}`),
  getDunningList:         () => request<any>('/analytics/dunning'),
  getAlertFeed:           () => request<any[]>('/alerts'),

  // ── Business audit log ────────────────────────────────────────────────
  getBusinessAuditLog: (id: string, page = 1) => request<any>(`/businesses/${id}/audit-log?page=${page}&limit=50`),
  getSuperAdminAuditLog: (page = 1) => request<any>(`/audit-log?page=${page}&limit=50`),

  // ── Bulk subscription update ──────────────────────────────────────────
  bulkUpdateSubscriptions: (businessIds: string[], data: { subscriptionStatus?: string; subscriptionTier?: string; trialDays?: number }) =>
    request<any>('/businesses/bulk-update', { method: 'POST', body: JSON.stringify({ businessIds, ...data }) }),

  cancelBusiness: (id: string, reason: string) =>
    request<any>(`/businesses/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ── IP Whitelist ──────────────────────────────────────────────────────
  getIpWhitelist: () => request<any[]>('/ip-whitelist'),
  addIp: (ip: string, label?: string) =>
    request<any>('/ip-whitelist', { method: 'POST', body: JSON.stringify({ ip, label }) }),
  removeIp: (id: string) => request<any>(`/ip-whitelist/${id}`, { method: 'DELETE' }),

  // ── Webhooks ──────────────────────────────────────────────────────────
  getWebhooks:   (page = 1) => request<any>(`/webhooks?page=${page}&limit=30`),
  retryWebhook:  (id: string) => request<any>(`/webhooks/${id}/retry`, { method: 'POST' }),
  toggleWebhook: (id: string, isActive: boolean) =>
    request<any>(`/webhooks/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),

  // ── Revenue Export ────────────────────────────────────────────────────
  exportRevenueCsv: async () => {
    const token = getAdminToken();
    const res = await fetch(`${API_BASE}/export/revenue-csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kastra-revenue-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
