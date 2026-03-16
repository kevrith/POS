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
  copy:    'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2 M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v0z',
  x:       'M18 6 6 18 M6 6l12 12',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  trash:   'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  shield:  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  reset:   'M1 4v6h6 M3.51 15a9 9 0 1 0 .49-4.5',
  lock:    'M12 22s-8-4-8-10V5l8-3 8 3v7c0 6-8 10-8 10z M9 12l2 2 4-4',
  save:    'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  building: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
};

const ROLES = ['ALL', 'OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT', 'WAITER', 'KITCHEN'];
const EDITABLE_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT', 'WAITER', 'KITCHEN'];

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

function StatusChip({ loginAttempts, lockedUntil }: { loginAttempts: number; lockedUntil: string | null }) {
  const locked = lockedUntil && new Date(lockedUntil) > new Date();
  if (locked) return (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: C.red }}>
      LOCKED ({loginAttempts} att.)
    </span>
  );
  if (loginAttempts > 0) return (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: C.amber }}>
      {loginAttempts} failed
    </span>
  );
  return (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 600, background: 'rgba(16,185,129,0.08)', color: C.green }}>
      Active
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

export default function UsersPage() {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '' });

  // Temp password modal
  const [tempPwModal, setTempPwModal] = useState<{ tempPassword: string; email: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listAllUsers(page, search || undefined, roleFilter !== 'ALL' ? roleFilter : undefined);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const handleResetPassword = async (u: any) => {
    if (!confirm(`Reset password for ${u.name}? A temporary password will be generated.`)) return;
    setActionLoading(u.id + '_reset');
    setError(null);
    try {
      const res = await adminApi.resetUserPassword(u.id);
      setTempPwModal({ tempPassword: res.tempPassword, email: res.email });
      load();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleUnlock = async (u: any) => {
    setActionLoading(u.id + '_unlock');
    setError(null);
    try {
      await adminApi.unlockUser(u.id);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    setActionLoading(editingId + '_edit');
    setError(null);
    try {
      await adminApi.updateUser(editingId, {
        name: editForm.name || undefined,
        email: editForm.email || undefined,
        role: editForm.role || undefined,
      });
      setEditingId(null);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (u: any) => {
    if (u.role === 'OWNER') { setError('Cannot delete a business owner account.'); return; }
    if (!confirm(`Delete user "${u.name}"? This action cannot be undone.`)) return;
    setActionLoading(u.id + '_del');
    setError(null);
    try {
      await adminApi.deleteUser(u.id);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const users: any[] = data?.users ?? [];

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Temp password modal */}
      {tempPwModal && (
        <div style={{
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: '12px', padding: '1rem 1.25rem',
          display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: C.green, marginBottom: '4px' }}>
              Password Reset Successful
            </div>
            <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: '0.5rem' }}>
              Share this temporary password with the user ({tempPwModal.email ?? 'no email'}). They must change it immediately after login.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ padding: '0.375rem 0.75rem', background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: '6px', fontSize: '0.9375rem', fontWeight: 700, color: C.text, letterSpacing: '0.05em' }}>
                {tempPwModal.tempPassword}
              </code>
              <button onClick={() => { navigator.clipboard.writeText(tempPwModal.tempPassword).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                style={btn('rgba(16,185,129,0.15)', C.green)}>
                <Icon d={Icons.copy} size={11} color={C.green} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={() => setTempPwModal(null)} style={btn('rgba(100,116,139,0.12)', C.textSecondary)}>
                <Icon d={Icons.x} size={11} color={C.textSecondary} /> Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', color: C.red, fontSize: '0.8125rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red }}>
            <Icon d={Icons.x} size={13} color={C.red} />
          </button>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon d={Icons.search} size={14} color={C.textMuted} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Search by name or email…"
            style={{ ...inputStyle, width: '100%', paddingLeft: '2.25rem', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = C.blue; }}
            onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
          />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} style={selectStyle}>
          {ROLES.map(r => <option key={r} value={r}>{r === 'ALL' ? 'All Roles' : r}</option>)}
        </select>
        <button onClick={load} style={{ ...btn('rgba(59,130,246,0.15)', C.blue), padding: '0.625rem 1rem' }}>
          <Icon d={Icons.refresh} size={12} color={C.blue} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div style={{ fontSize: '0.8125rem', color: C.textMuted }}>
        Showing <strong style={{ color: C.textSecondary }}>{users.length}</strong> of{' '}
        <strong style={{ color: C.textSecondary }}>{data?.total ?? 0}</strong> users
        {roleFilter !== 'ALL' && ` · Role: ${roleFilter}`}
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {['User', 'Email', 'Role', 'Business', 'Status', 'Joined', 'Actions'].map(h => (
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
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>Loading…</td></tr>
              )}

              {!loading && users.map((u: any) => (
                <React.Fragment key={u.id}>
                  {editingId === u.id ? (
                    <tr style={{ borderTop: `1px solid ${C.cardBorder}`, background: 'rgba(59,130,246,0.04)' }}>
                      <td colSpan={7} style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.blue, marginRight: '0.25rem', flexShrink: 0 }}>
                            Editing: {u.name}
                          </span>
                          <input
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Full name"
                            style={{ ...inputStyle, width: '160px' }}
                          />
                          <input
                            value={editForm.email}
                            onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            placeholder="Email"
                            type="email"
                            style={{ ...inputStyle, width: '200px' }}
                          />
                          <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} style={selectStyle}>
                            {EDITABLE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button onClick={handleEditSave} disabled={actionLoading === u.id + '_edit'}
                            style={{ ...btn(C.green, '#fff'), padding: '0.4375rem 0.875rem' }}>
                            <Icon d={Icons.save} size={11} color="#fff" />
                            {actionLoading === u.id + '_edit' ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} style={btn('rgba(100,116,139,0.12)', C.textSecondary)}>
                            <Icon d={Icons.x} size={11} color={C.textSecondary} /> Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      style={{ borderTop: `1px solid ${C.cardBorder}`, transition: 'background 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(59,130,246,0.03)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>

                      {/* User */}
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                            background: u.role === 'OWNER' ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6875rem', fontWeight: 800, color: '#fff',
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}>
                            {u.name?.charAt(0)?.toUpperCase() ?? '?'}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.text }}>{u.name ?? '—'}</div>
                            <div style={{ fontSize: '0.625rem', color: C.textMuted, fontFamily: 'monospace' }}>{u.id.slice(0, 12)}…</div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8125rem', color: C.textMuted, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email ?? <em style={{ opacity: 0.5 }}>No email</em>}
                      </td>

                      {/* Role */}
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <RoleBadge role={u.role} />
                      </td>

                      {/* Business */}
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Icon d={Icons.building} size={11} color={C.textMuted} />
                          <span style={{ fontSize: '0.8125rem', color: C.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px', display: 'block' }}>
                            {u.business?.name ?? '—'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <StatusChip loginAttempts={u.loginAttempts ?? 0} lockedUntil={u.lockedUntil} />
                      </td>

                      {/* Joined */}
                      <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.75rem', color: C.textMuted, whiteSpace: 'nowrap' }}>
                        {new Date(u.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.3125rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => { setEditingId(u.id); setEditForm({ name: u.name ?? '', email: u.email ?? '', role: u.role }); }}
                            title="Edit name / email / role"
                            style={btn('rgba(59,130,246,0.1)', '#93c5fd')}>
                            <Icon d={Icons.edit} size={10} color="#93c5fd" /> Edit
                          </button>
                          <button
                            onClick={() => handleResetPassword(u)}
                            disabled={actionLoading === u.id + '_reset'}
                            title="Generate temporary password"
                            style={btn('rgba(245,158,11,0.1)', C.amber)}>
                            <Icon d={Icons.reset} size={10} color={C.amber} />
                            {actionLoading === u.id + '_reset' ? '…' : 'Reset PW'}
                          </button>
                          {(u.lockedUntil ? new Date(u.lockedUntil) > new Date() : false) || (u.loginAttempts ?? 0) > 0 ? (
                            <button
                              onClick={() => handleUnlock(u)}
                              disabled={actionLoading === u.id + '_unlock'}
                              title="Clear lockout"
                              style={btn('rgba(239,68,68,0.1)', C.red)}>
                              <Icon d={Icons.lock} size={10} color={C.red} />
                              {actionLoading === u.id + '_unlock' ? '…' : 'Unlock'}
                            </button>
                          ) : null}
                          {u.role !== 'OWNER' && (
                            <button
                              onClick={() => handleDelete(u)}
                              disabled={actionLoading === u.id + '_del'}
                              title="Delete user"
                              style={btn('rgba(239,68,68,0.08)', '#f87171')}>
                              <Icon d={Icons.trash} size={10} color="#f87171" />
                              {actionLoading === u.id + '_del' ? '…' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}

              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '3.5rem', textAlign: 'center', color: C.textMuted }}>
                    <div style={{ marginBottom: '0.75rem' }}><Icon d={Icons.search} size={28} color={C.cardBorder2} /></div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: C.textSecondary }}>No users found</div>
                    <div style={{ fontSize: '0.8125rem', marginTop: '4px' }}>Try adjusting the search or role filter</div>
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
            Page <strong style={{ color: C.textSecondary }}>{page}</strong> — {data.total ?? 0} total users
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ ...btn('rgba(255,255,255,0.05)', C.textSecondary), opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer', padding: '0.5rem 1rem' }}>
              ← Prev
            </button>
            <span style={{ padding: '0.375rem 0.875rem', color: C.textSecondary, fontWeight: 700, background: C.surface, borderRadius: '8px', border: `1px solid ${C.cardBorder}` }}>
              {page}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={(users.length ?? 0) < 30}
              style={{ ...btn('rgba(255,255,255,0.05)', C.textSecondary), opacity: (users.length ?? 0) < 30 ? 0.4 : 1, cursor: (users.length ?? 0) < 30 ? 'not-allowed' : 'pointer', padding: '0.5rem 1rem' }}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Policy note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: C.textMuted, fontSize: '0.6875rem' }}>
        <Icon d={Icons.shield} size={11} color={C.textMuted} />
        Owner accounts cannot be deleted. Password reset generates a secure temporary password — the user must change it on next login.
      </div>
    </div>
  );
}
