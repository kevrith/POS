import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../lib/api';

const C = {
  card: '#111827', cardBorder: '#1e293b',
  text: '#f1f5f9', textMuted: '#64748b', textSecondary: '#94a3b8',
  input: '#020617', inputBorder: '#1e293b',
  blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', red: '#ef4444', purple: '#8b5cf6',
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
    <span style={{
      padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700,
      background: c.bg, color: c.color, letterSpacing: '0.02em',
    }}>{status}</span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    ENTERPRISE: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
    PRO:        { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    STARTER:    { bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
  };
  const c = m[plan] ?? m.STARTER;
  return (
    <span style={{
      padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700,
      background: c.bg, color: c.color,
    }}>{plan}</span>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem', background: C.input,
  border: `1px solid ${C.inputBorder}`, borderRadius: '8px',
  color: C.text, fontSize: '0.875rem', outline: 'none', cursor: 'pointer',
};
const actionBtn = (color: string, textColor: string): React.CSSProperties => ({
  padding: '0.3rem 0.75rem', background: color, color: textColor,
  border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontSize: '0.75rem', fontWeight: 600, transition: 'opacity 0.1s',
  whiteSpace: 'nowrap' as const,
});

export default function BusinessesPage() {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ subscriptionStatus: '', subscriptionTier: '', trialDays: '' });
  const [impersonateResult, setImpersonateResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.getBusinesses(page, search || undefined);
      setData(result);
    } catch (e: any) { alert(e.message); }
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

  const impersonate = async (id: string) => {
    try { setImpersonateResult(await adminApi.impersonate(id)); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <div className="fade-in">
      {/* Impersonate banner */}
      {impersonateResult && (
        <div style={{
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#93c5fd', marginBottom: '4px' }}>
              🔑 Impersonation Token — {impersonateResult.businessName} ({impersonateResult.ownerEmail})
            </div>
            <code style={{ fontSize: '0.6875rem', color: '#60a5fa', wordBreak: 'break-all', display: 'block' }}>
              {impersonateResult.token}
            </code>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={() => navigator.clipboard.writeText(impersonateResult.token)}
              style={actionBtn('rgba(59,130,246,0.2)', '#93c5fd')}>
              📋 Copy
            </button>
            <button onClick={() => setImpersonateResult(null)}
              style={actionBtn('rgba(100,116,139,0.2)', '#94a3b8')}>
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="🔍  Search businesses by name…"
          style={{
            flex: 1, padding: '0.75rem 1rem',
            background: C.input, border: `1px solid ${C.inputBorder}`,
            borderRadius: '10px', color: C.text, fontSize: '0.875rem', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = C.blue; }}
          onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
        />
        <button onClick={load}
          style={{
            padding: '0.75rem 1.5rem', background: C.blue, color: '#fff',
            border: 'none', borderRadius: '10px', cursor: 'pointer',
            fontSize: '0.875rem', fontWeight: 600,
          }}>
          Search
        </button>
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0a0f1e' }}>
                {['Business', 'Owner', 'Status', 'Plan', 'Trial Ends', 'Users', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '0.875rem 1.25rem', textAlign: 'left',
                    fontSize: '0.6875rem', color: C.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>Loading…</td></tr>
              )}
              {!loading && data?.businesses?.map((b: any) =>
                editingId === b.id ? (
                  <tr key={b.id} style={{ borderTop: `1px solid ${C.cardBorder}`, background: 'rgba(59,130,246,0.05)' }}>
                    <td colSpan={7} style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={editForm.subscriptionStatus}
                          onChange={e => setEditForm(f => ({...f, subscriptionStatus: e.target.value}))}
                          style={selectStyle}>
                          {['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={editForm.subscriptionTier}
                          onChange={e => setEditForm(f => ({...f, subscriptionTier: e.target.value}))}
                          style={selectStyle}>
                          {['STARTER', 'PRO', 'ENTERPRISE'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input value={editForm.trialDays}
                          onChange={e => setEditForm(f => ({...f, trialDays: e.target.value}))}
                          placeholder="Extend trial by N days"
                          type="number"
                          style={{ ...selectStyle, width: '180px' }} />
                        <button onClick={saveEdit}
                          style={{ padding: '0.5rem 1.25rem', background: C.green, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ padding: '0.5rem 1rem', background: 'rgba(100,116,139,0.15)', color: C.textSecondary, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id} style={{ borderTop: `1px solid ${C.cardBorder}`, transition: 'background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                    <td style={{ padding: '0.875rem 1.25rem', color: C.text, fontWeight: 600, fontSize: '0.875rem' }}>{b.name}</td>
                    <td style={{ padding: '0.875rem 1.25rem', color: C.textSecondary, fontSize: '0.8125rem' }}>{b.users?.[0]?.email ?? '—'}</td>
                    <td style={{ padding: '0.875rem 1.25rem' }}><StatusBadge status={b.subscriptionStatus} /></td>
                    <td style={{ padding: '0.875rem 1.25rem' }}><PlanBadge plan={b.subscriptionTier ?? b.planName ?? 'STARTER'} /></td>
                    <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem' }}>
                      {b.trialEndsAt ? new Date(b.trialEndsAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', color: C.textSecondary }}>{b._count?.users ?? 0}</td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingId(b.id); setEditForm({ subscriptionStatus: b.subscriptionStatus, subscriptionTier: b.subscriptionTier, trialDays: '' }); }}
                          style={actionBtn('rgba(59,130,246,0.15)', '#93c5fd')}>
                          ✏️ Edit
                        </button>
                        <button onClick={() => impersonate(b.id)}
                          style={actionBtn('rgba(139,92,246,0.15)', '#c4b5fd')}>
                          🔑 Login As
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {!loading && data?.businesses?.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                  No businesses found
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', color: C.textMuted, fontSize: '0.8125rem' }}>
          <span>{data.total ?? 0} businesses total</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ ...actionBtn('rgba(255,255,255,0.05)', C.textSecondary), opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
              ← Prev
            </button>
            <span style={{ padding: '0.375rem 0.75rem', color: C.textSecondary, fontWeight: 600 }}>Page {page}</span>
            <button
              onClick={() => setPage(p => p + 1)} disabled={(data.businesses?.length ?? 0) < 20}
              style={{ ...actionBtn('rgba(255,255,255,0.05)', C.textSecondary), opacity: (data.businesses?.length ?? 0) < 20 ? 0.4 : 1, cursor: (data.businesses?.length ?? 0) < 20 ? 'not-allowed' : 'pointer' }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
