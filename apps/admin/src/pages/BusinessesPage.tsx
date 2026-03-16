import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../lib/api';

const C = {
  bg:            '#030712',
  surface:       '#0a0f1e',
  card:          '#0f172a',
  cardBorder:    '#1e293b',
  cardBorder2:   '#263347',
  text:          '#f1f5f9',
  textMuted:     '#64748b',
  textSecondary: '#94a3b8',
  input:         '#060c1a',
  inputBorder:   '#1e293b',
  blue:          '#3b82f6',
  green:         '#10b981',
  amber:         '#f59e0b',
  red:           '#ef4444',
  purple:        '#8b5cf6',
  cyan:          '#06b6d4',
};

function Icon({ d, size = 14, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const Icons = {
  search:  'M11 17.25a6.25 6.25 0 1 1 0-12.5 6.25 6.25 0 0 1 0 12.5z M16 16l4 4',
  edit:    'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  key:     'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  users:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  chevron: 'M6 9l6 6 6-6',
  user:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  copy:    'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2 M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v0z',
  shield:  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  x:       'M18 6 6 18 M6 6l12 12',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
};

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    ACTIVE:    { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    TRIAL:     { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    EXPIRED:   { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
    CANCELLED: { bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
  };
  const c = m[status] ?? m.CANCELLED;
  return (
    <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700, background: c.bg, color: c.color, letterSpacing: '0.03em' }}>
      {status}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    ENTERPRISE: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
    PRO:        { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    STARTER:    { bg: 'rgba(100,116,139,0.1)',  color: '#94a3b8' },
  };
  const c = m[plan ?? 'STARTER'] ?? m.STARTER;
  return (
    <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700, background: c.bg, color: c.color }}>
      {plan ?? 'STARTER'}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    OWNER:      { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
    MANAGER:    { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    CASHIER:    { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    ACCOUNTANT: { bg: 'rgba(99,102,241,0.12)',  color: '#818cf8' },
    WAITER:     { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    KITCHEN:    { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
  };
  const c = m[role] ?? { bg: 'rgba(100,116,139,0.1)', color: '#94a3b8' };
  return (
    <span style={{ padding: '1px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 700, background: c.bg, color: c.color }}>
      {role}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.625rem 0.875rem',
  background: C.input, border: `1px solid ${C.inputBorder}`,
  borderRadius: '8px', color: C.text, fontSize: '0.875rem', outline: 'none',
};

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem', background: C.input,
  border: `1px solid ${C.inputBorder}`, borderRadius: '8px',
  color: C.text, fontSize: '0.875rem', outline: 'none', cursor: 'pointer',
};

function btn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '0.3125rem 0.75rem', background: bg, color,
    border: 'none', borderRadius: '7px', cursor: 'pointer',
    fontSize: '0.75rem', fontWeight: 600, transition: 'opacity 0.1s',
    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px',
  };
}

// ── User Management Panel (enterprise) ────────────────────────────────────────
const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT', 'WAITER', 'KITCHEN'];

function UserManagementPanel({ businessId, businessName }: { businessId: string; businessName: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '' });
  const [tempPasswordModal, setTempPasswordModal] = useState<{ userId: string; tempPassword: string; email: string | null } | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    adminApi.getBusinessUsers(businessId)
      .then(setUsers).catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [businessId]);

  useEffect(() => { reload(); }, [reload]);

  const handleResetPassword = async (u: any) => {
    if (!confirm(`Reset password for ${u.name}? A temporary password will be generated.`)) return;
    setActionLoading(u.id + '_reset');
    setError(null);
    try {
      const res = await adminApi.resetUserPassword(u.id);
      setTempPasswordModal({ userId: u.id, tempPassword: res.tempPassword, email: res.email });
      reload();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleUnlock = async (u: any) => {
    setActionLoading(u.id + '_unlock');
    setError(null);
    try {
      await adminApi.unlockUser(u.id);
      reload();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleEditSave = async () => {
    if (!editingUser) return;
    setActionLoading(editingUser.id + '_edit');
    setError(null);
    try {
      await adminApi.updateUser(editingUser.id, {
        name: editForm.name || undefined,
        email: editForm.email || undefined,
        role: editForm.role || undefined,
      });
      setEditingUser(null);
      reload();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const isLocked = (u: any) => u.lockedUntil && new Date(u.lockedUntil) > new Date();

  const iconLock   = 'M12 22s-8-4-8-10V5l8-3 8 3v7c0 6-8 10-8 10z M9 12l2 2 4-4';
  const iconReset  = 'M1 4v6h6 M3.51 15a9 9 0 1 0 .49-4.5';
  const iconEdit2  = 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z';
  const iconSave   = 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8';

  return (
    <tr>
      <td colSpan={8} style={{ padding: 0 }}>
        <div style={{
          background: 'linear-gradient(180deg,rgba(59,130,246,0.05) 0%,rgba(59,130,246,0.01) 100%)',
          borderTop: '1px solid rgba(59,130,246,0.18)', borderBottom: `1px solid ${C.cardBorder}`,
        }}>
          {/* Panel header */}
          <div style={{ padding: '0.875rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Icon d={Icons.users} size={15} color={C.blue} />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: C.blue }}>User Management</span>
            <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>—</span>
            <span style={{ fontSize: '0.8125rem', color: C.textSecondary, fontWeight: 500 }}>{businessName}</span>
            {!loading && (
              <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: C.textMuted, background: C.surface, padding: '2px 10px', borderRadius: '20px', border: `1px solid ${C.cardBorder}`, fontWeight: 600 }}>
                {users.length} user{users.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {error && (
            <div style={{ margin: '0.75rem 1.5rem', padding: '0.5rem 0.875rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: C.red, fontSize: '0.8125rem' }}>
              {error}
            </div>
          )}

          {/* Temp password modal */}
          {tempPasswordModal && (
            <div style={{ margin: '0.75rem 1.5rem', padding: '1rem 1.25rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: C.green, marginBottom: '0.5rem' }}>
                Password Reset Successful
              </div>
              <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: '0.5rem' }}>
                Share this temporary password with the user ({tempPasswordModal.email ?? 'no email'}). They should change it immediately after logging in.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <code style={{ padding: '0.375rem 0.75rem', background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: '6px', fontSize: '0.875rem', fontWeight: 700, color: C.text, letterSpacing: '0.05em', flexShrink: 0 }}>
                  {tempPasswordModal.tempPassword}
                </code>
                <button onClick={() => {
                  navigator.clipboard.writeText(tempPasswordModal.tempPassword).then(() => { setCopiedPw(true); setTimeout(() => setCopiedPw(false), 2000); });
                }} style={btn('rgba(16,185,129,0.15)', C.green)}>
                  <Icon d={Icons.copy} size={11} color={C.green} />
                  {copiedPw ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={() => setTempPasswordModal(null)} style={btn('rgba(100,116,139,0.12)', C.textSecondary)}>
                  <Icon d={Icons.x} size={11} color={C.textSecondary} /> Dismiss
                </button>
              </div>
            </div>
          )}

          {/* User table */}
          <div style={{ padding: '0 1.5rem 1rem' }}>
            {loading ? (
              <div style={{ padding: '1.5rem 0', color: C.textMuted, fontSize: '0.8125rem' }}>Loading users…</div>
            ) : users.length === 0 ? (
              <div style={{ padding: '1.5rem 0', color: C.textMuted, fontSize: '0.8125rem' }}>No users found for this business.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
                <thead>
                  <tr>
                    {['User', 'Email', 'Role', 'Joined', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.625rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, borderBottom: `1px solid ${C.cardBorder}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <React.Fragment key={u.id}>
                      {editingUser?.id === u.id ? (
                        <tr style={{ background: 'rgba(59,130,246,0.04)' }}>
                          <td colSpan={6} style={{ padding: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.blue, marginRight: '0.25rem' }}>Editing: {u.name}</span>
                              <input
                                value={editForm.name}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Full name"
                                style={{ ...inputStyle, width: '160px' }}
                              />
                              <input
                                value={editForm.email}
                                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="Email address"
                                type="email"
                                style={{ ...inputStyle, width: '200px' }}
                              />
                              <select
                                value={editForm.role}
                                onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                                style={{ ...selectStyle }}
                              >
                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <button
                                onClick={handleEditSave}
                                disabled={actionLoading === u.id + '_edit'}
                                style={{ ...btn(C.green, '#fff'), padding: '0.4375rem 0.875rem' }}>
                                <Icon d={iconSave} size={11} color="#fff" />
                                {actionLoading === u.id + '_edit' ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={() => setEditingUser(null)} style={btn('rgba(100,116,139,0.12)', C.textSecondary)}>
                                <Icon d={Icons.x} size={11} color={C.textSecondary} /> Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr style={{ borderBottom: `1px solid ${C.cardBorder}` }}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                          <td style={{ padding: '0.625rem 0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{
                                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                                background: u.role === 'OWNER' ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.6875rem', fontWeight: 800, color: '#fff', border: `1px solid ${C.cardBorder2}`,
                              }}>
                                {u.name?.charAt(0)?.toUpperCase() ?? '?'}
                              </div>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.text }}>{u.name ?? '—'}</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.75rem', color: C.textMuted, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.email ?? <span style={{ fontStyle: 'italic' }}>No email</span>}
                          </td>
                          <td style={{ padding: '0.625rem 0.75rem' }}><RoleBadge role={u.role} /></td>
                          <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.6875rem', color: C.textMuted, whiteSpace: 'nowrap' }}>
                            {new Date(u.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </td>
                          <td style={{ padding: '0.625rem 0.75rem' }}>
                            {isLocked(u) ? (
                              <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: C.red }}>
                                LOCKED ({u.loginAttempts ?? 0} attempts)
                              </span>
                            ) : u.loginAttempts > 0 ? (
                              <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: C.amber }}>
                                {u.loginAttempts} failed attempt{u.loginAttempts !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 600, background: 'rgba(16,185,129,0.08)', color: C.green }}>
                                Active
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.625rem 0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.3125rem', flexWrap: 'wrap' }}>
                              {/* Edit */}
                              <button
                                onClick={() => { setEditingUser(u); setEditForm({ name: u.name ?? '', email: u.email ?? '', role: u.role }); }}
                                title="Edit user"
                                style={btn('rgba(59,130,246,0.1)', '#93c5fd')}>
                                <Icon d={iconEdit2} size={10} color="#93c5fd" /> Edit
                              </button>
                              {/* Reset Password */}
                              <button
                                onClick={() => handleResetPassword(u)}
                                disabled={actionLoading === u.id + '_reset'}
                                title="Generate temporary password"
                                style={btn('rgba(245,158,11,0.1)', C.amber)}>
                                <Icon d={iconReset} size={10} color={C.amber} />
                                {actionLoading === u.id + '_reset' ? '…' : 'Reset PW'}
                              </button>
                              {/* Unlock (only if locked or has failed attempts) */}
                              {(isLocked(u) || (u.loginAttempts ?? 0) > 0) && (
                                <button
                                  onClick={() => handleUnlock(u)}
                                  disabled={actionLoading === u.id + '_unlock'}
                                  title="Clear lockout and failed attempts"
                                  style={btn('rgba(239,68,68,0.1)', C.red)}>
                                  <Icon d={iconLock} size={10} color={C.red} />
                                  {actionLoading === u.id + '_unlock' ? '…' : 'Unlock'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Password reset policy note */}
          <div style={{ padding: '0.5rem 1.5rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icon d={Icons.shield} size={11} color={C.textMuted} />
            <span style={{ fontSize: '0.6875rem', color: C.textMuted }}>
              Admin-triggered reset generates a temporary password. Users can also reset via <strong style={{ color: C.textSecondary }}>Forgot Password</strong> on the login page (email required).
            </span>
          </div>
        </div>
      </td>
    </tr>
  );
}

// Keep alias for backwards compat
const UserDrawer = UserManagementPanel;

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BusinessesPage() {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [planFilter, setPlanFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ subscriptionStatus: '', subscriptionTier: '', trialDays: '' });
  const [expandedUsers, setExpandedUsers] = useState<string | null>(null);
  const [impersonateResult, setImpersonateResult] = useState<any>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkTier, setBulkTier] = useState('');
  const [bulkTrialDays, setBulkTrialDays] = useState('');
  const [bulking, setBulking] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.getBusinesses(page, search || undefined);
      setData(result);
    } catch (e: any) { console.error(e.message); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const payload: any = { subscriptionStatus: editForm.subscriptionStatus, subscriptionTier: editForm.subscriptionTier };
      if (editForm.trialDays) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(editForm.trialDays));
        payload.trialEndsAt = d.toISOString();
      }
      await adminApi.updateSubscription(editingId, payload);
      setEditingId(null);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const ids = (data?.businesses ?? []).map((b: any) => b.id);
    setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids));
  };

  const applyBulk = async () => {
    if (selected.size === 0) return;
    setBulking(true);
    try {
      const payload: any = {};
      if (bulkStatus)    payload.subscriptionStatus = bulkStatus;
      if (bulkTier)      payload.subscriptionTier   = bulkTier;
      if (bulkTrialDays) payload.trialDays = parseInt(bulkTrialDays);
      await adminApi.bulkUpdateSubscriptions(Array.from(selected), payload);
      setBulkMsg(`Updated ${selected.size} businesses.`);
      setSelected(new Set()); setBulkStatus(''); setBulkTier(''); setBulkTrialDays('');
      load();
      setTimeout(() => setBulkMsg(''), 4000);
    } catch (e: any) { setBulkMsg('Error: ' + e.message); }
    finally { setBulking(false); }
  };

  const impersonate = async (id: string) => {
    try {
      const result = await adminApi.impersonate(id);
      setImpersonateResult(result);
    }
    catch (e: any) { alert(e.message); }
  };

  const copyToken = () => {
    if (!impersonateResult) return;
    navigator.clipboard.writeText(impersonateResult.token).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  };

  // Client-side filter on top of server data
  const businesses: any[] = (data?.businesses ?? []).filter((b: any) => {
    if (statusFilter !== 'ALL' && b.subscriptionStatus !== statusFilter) return false;
    const plan = b.subscriptionTier ?? b.planName ?? 'STARTER';
    if (planFilter !== 'ALL' && plan !== planFilter) return false;
    return true;
  });

  const statusTabs = [
    { id: 'ALL',       label: 'All',       color: C.blue },
    { id: 'ACTIVE',    label: 'Active',    color: C.green },
    { id: 'TRIAL',     label: 'Trial',     color: C.amber },
    { id: 'EXPIRED',   label: 'Expired',   color: C.red },
    { id: 'CANCELLED', label: 'Cancelled', color: C.textMuted },
  ];

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Impersonate banner */}
      {impersonateResult && (
        <div style={{
          background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: '12px', padding: '1rem 1.25rem',
          display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, color: C.blue }}>
            <Icon d={Icons.key} size={16} color={C.blue} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#93c5fd', marginBottom: '4px' }}>
              Impersonation token — {impersonateResult.businessName} ({impersonateResult.ownerEmail})
            </div>
            <code style={{ fontSize: '0.6875rem', color: '#60a5fa', wordBreak: 'break-all', display: 'block', lineHeight: 1.5 }}>
              {impersonateResult.token}
            </code>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={copyToken} style={btn('rgba(59,130,246,0.2)', '#93c5fd')}>
              <Icon d={Icons.copy} size={12} color="#93c5fd" />
              {copiedToken ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={() => setImpersonateResult(null)} style={btn('rgba(100,116,139,0.15)', C.textSecondary)}>
              <Icon d={Icons.x} size={12} color={C.textSecondary} />
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: C.textMuted, pointerEvents: 'none' }}>
            <Icon d={Icons.search} size={14} color={C.textMuted} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Search businesses by name…"
            style={{ ...inputStyle, width: '100%', paddingLeft: '2.25rem', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = C.blue; }}
            onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
          />
        </div>
        <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="ALL">All Plans</option>
          <option value="STARTER">Starter</option>
          <option value="PRO">Pro</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
        <button onClick={load} style={{ ...btn('rgba(59,130,246,0.15)', C.blue), padding: '0.625rem 1rem' }}>
          <Icon d={Icons.refresh} size={12} color={C.blue} />
          Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '4px', background: C.surface, padding: '4px', borderRadius: '10px', border: `1px solid ${C.cardBorder}`, width: 'fit-content' }}>
        {statusTabs.map(tab => (
          <button key={tab.id}
            onClick={() => { setStatusFilter(tab.id); setPage(1); }}
            style={{
              padding: '0.375rem 0.875rem',
              border: 'none', borderRadius: '7px', cursor: 'pointer',
              fontSize: '0.8125rem', fontWeight: 600, transition: 'all 0.15s',
              background: statusFilter === tab.id ? `${tab.color}18` : 'transparent',
              color: statusFilter === tab.id ? tab.color : C.textMuted,
              outline: statusFilter === tab.id ? `1px solid ${tab.color}30` : 'none',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary line */}
      <div style={{ fontSize: '0.8125rem', color: C.textMuted }}>
        Showing <strong style={{ color: C.textSecondary }}>{businesses.length}</strong> of{' '}
        <strong style={{ color: C.textSecondary }}>{data?.total ?? 0}</strong> businesses
        {statusFilter !== 'ALL' && ` · Status: ${statusFilter}`}
        {planFilter !== 'ALL' && ` · Plan: ${planFilter}`}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ background: 'rgba(59,130,246,0.08)', border: `1px solid rgba(59,130,246,0.25)`, borderRadius: 10, padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: C.blue }}>{selected.size} selected</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.text, fontSize: '0.8125rem' }}>
            <option value="">Status…</option>
            {['ACTIVE','TRIAL','EXPIRED','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={bulkTier} onChange={e => setBulkTier(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.text, fontSize: '0.8125rem' }}>
            <option value="">Tier…</option>
            {['STARTER','PRO','ENTERPRISE'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="number" value={bulkTrialDays} onChange={e => setBulkTrialDays(e.target.value)}
            placeholder="Extend trial (days)"
            style={{ width: 140, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.text, fontSize: '0.8125rem' }} />
          <button onClick={applyBulk} disabled={bulking || (!bulkStatus && !bulkTier && !bulkTrialDays)}
            style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: C.blue, color: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: (!bulkStatus && !bulkTier && !bulkTrialDays) ? 0.4 : 1 }}>
            {bulking ? 'Applying…' : 'Apply'}
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textMuted, cursor: 'pointer', fontSize: '0.8125rem' }}>
            Clear
          </button>
          {bulkMsg && <span style={{ fontSize: '0.8125rem', color: C.green }}>{bulkMsg}</span>}
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.surface }}>
                <th style={{ padding: '0.75rem 0.75rem 0.75rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}` }}>
                  <input type="checkbox" checked={selected.size > 0 && selected.size === (data?.businesses?.length ?? 0)}
                    onChange={selectAll} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                </th>
                {['Business', 'Owner', 'Status', 'Plan', 'Trial Ends', 'Stores', 'Users', 'LTV (Est.)', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '0.75rem 1.25rem', textAlign: 'left',
                    fontSize: '0.6875rem', color: C.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
                    whiteSpace: 'nowrap', borderBottom: `1px solid ${C.cardBorder}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
                  <div style={{ marginBottom: '0.5rem', color: C.cardBorder2 }}><Icon d={Icons.refresh} size={20} color={C.cardBorder2} /></div>
                  Loading…
                </td></tr>
              )}

              {!loading && businesses.map((b: any) => (
                <React.Fragment key={b.id}>
                  {editingId === b.id ? (
                    <tr style={{ borderTop: `1px solid ${C.cardBorder}`, background: 'rgba(59,130,246,0.04)' }}>
                      <td colSpan={8} style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.blue, marginRight: '0.25rem' }}>
                            Editing: {b.name}
                          </div>
                          <select value={editForm.subscriptionStatus}
                            onChange={e => setEditForm(f => ({ ...f, subscriptionStatus: e.target.value }))}
                            style={selectStyle}>
                            {['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={editForm.subscriptionTier}
                            onChange={e => setEditForm(f => ({ ...f, subscriptionTier: e.target.value }))}
                            style={selectStyle}>
                            {['STARTER', 'PRO', 'ENTERPRISE'].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input value={editForm.trialDays}
                            onChange={e => setEditForm(f => ({ ...f, trialDays: e.target.value }))}
                            placeholder="Extend trial (days)"
                            type="number" min="1"
                            style={{ ...selectStyle, width: '170px' }} />
                          <button onClick={saveEdit}
                            style={{ padding: '0.5rem 1.25rem', background: C.green, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
                            Save Changes
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ padding: '0.5rem 1rem', background: 'rgba(100,116,139,0.12)', color: C.textSecondary, border: `1px solid ${C.cardBorder}`, borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      style={{ borderTop: `1px solid ${C.cardBorder}`, transition: 'background 0.12s', background: selected.has(b.id) ? 'rgba(59,130,246,0.06)' : 'transparent' }}
                      onMouseEnter={e => { if (!selected.has(b.id)) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(59,130,246,0.03)'; }}
                      onMouseLeave={e => { if (!selected.has(b.id)) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                      <td style={{ padding: '0.875rem 0.75rem 0.875rem 1.25rem' }}>
                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)}
                          style={{ cursor: 'pointer', width: 14, height: 14 }} />
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ fontWeight: 600, color: C.text, fontSize: '0.875rem' }}>{b.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginTop: '1px', fontFamily: 'monospace' }}>{b.id}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ fontSize: '0.8125rem', color: C.textSecondary }}>{b.users?.[0]?.email ?? '—'}</div>
                        {b.users?.[0]?.name && <div style={{ fontSize: '0.6875rem', color: C.textMuted }}>{b.users[0].name}</div>}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}><StatusBadge status={b.subscriptionStatus} /></td>
                      <td style={{ padding: '0.875rem 1.25rem' }}><PlanBadge plan={b.subscriptionTier ?? b.planName ?? 'STARTER'} /></td>
                      <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {b.trialEndsAt ? new Date(b.trialEndsAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: C.textSecondary, fontSize: '0.8125rem', textAlign: 'center' }}>
                        {b._count?.stores ?? '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', textAlign: 'center' }}>
                        <button
                          onClick={() => setExpandedUsers(expandedUsers === b.id ? null : b.id)}
                          style={{
                            ...btn(expandedUsers === b.id ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.08)', expandedUsers === b.id ? C.blue : C.textSecondary),
                            gap: '4px',
                          }}>
                          <Icon d={Icons.users} size={11} color={expandedUsers === b.id ? C.blue : C.textMuted} />
                          {b._count?.users ?? 0}
                          <Icon d={Icons.chevron} size={10} color={expandedUsers === b.id ? C.blue : C.textMuted} />
                        </button>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        {(() => {
                          const PLAN_PRICE: Record<string, number> = { STARTER: 1499, PRO: 3999, ENTERPRISE: 9999, TRIAL: 0 };
                          const tier = b.subscriptionTier ?? b.planName ?? 'TRIAL';
                          const months = Math.max(1, Math.round((Date.now() - new Date(b.createdAt).getTime()) / (30 * 86400000)));
                          const ltv = months * (PLAN_PRICE[tier] ?? 0);
                          return ltv > 0 ? (
                            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: C.green }}>
                              KES {ltv.toLocaleString('en-KE')}
                            </span>
                          ) : <span style={{ color: C.textMuted, fontSize: '0.75rem' }}>—</span>;
                        })()}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => { setEditingId(b.id); setEditForm({ subscriptionStatus: b.subscriptionStatus, subscriptionTier: b.subscriptionTier ?? 'STARTER', trialDays: '' }); }}
                            style={btn('rgba(59,130,246,0.12)', '#93c5fd')}>
                            <Icon d={Icons.edit} size={11} color="#93c5fd" />
                            Edit
                          </button>
                          <button onClick={() => impersonate(b.id)}
                            style={btn('rgba(139,92,246,0.12)', '#c4b5fd')}>
                            <Icon d={Icons.key} size={11} color="#c4b5fd" />
                            Login As
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline user drawer */}
                  {expandedUsers === b.id && (
                    <UserDrawer key={`users-${b.id}`} businessId={b.id} businessName={b.name} />
                  )}
                </React.Fragment>
              ))}

              {!loading && businesses.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '3.5rem', textAlign: 'center', color: C.textMuted }}>
                    <div style={{ marginBottom: '0.75rem', color: C.cardBorder2 }}><Icon d={Icons.search} size={28} color={C.cardBorder2} /></div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: C.textSecondary }}>No businesses found</div>
                    <div style={{ fontSize: '0.8125rem', color: C.textMuted, marginTop: '4px' }}>Try adjusting the search or filters</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: C.textMuted, fontSize: '0.8125rem' }}>
          <span>
            Page <strong style={{ color: C.textSecondary }}>{page}</strong> — {data.total ?? 0} total businesses
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ ...btn('rgba(255,255,255,0.05)', C.textSecondary), opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer', padding: '0.5rem 1rem' }}>
              ← Prev
            </button>
            <span style={{ padding: '0.375rem 0.875rem', color: C.textSecondary, fontWeight: 700, background: C.surface, borderRadius: '8px', border: `1px solid ${C.cardBorder}` }}>
              {page}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={(data.businesses?.length ?? 0) < 20}
              style={{ ...btn('rgba(255,255,255,0.05)', C.textSecondary), opacity: (data.businesses?.length ?? 0) < 20 ? 0.4 : 1, cursor: (data.businesses?.length ?? 0) < 20 ? 'not-allowed' : 'pointer', padding: '0.5rem 1rem' }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
