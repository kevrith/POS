import { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

const C = {
  card: '#111827', cardBorder: '#1e293b',
  text: '#f1f5f9', textMuted: '#64748b', textSecondary: '#94a3b8',
  input: '#020617', inputBorder: '#1e293b',
  blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', red: '#ef4444', purple: '#8b5cf6',
};

const inputStyle: React.CSSProperties = {
  padding: '0.75rem 1rem', background: C.input,
  border: `1px solid ${C.inputBorder}`,
  borderRadius: '10px', color: C.text, fontSize: '0.875rem', outline: 'none',
};

function TierBadge({ tier }: { tier: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    ENTERPRISE: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
    PRO:        { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    STARTER:    { bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
  };
  const c = m[tier] ?? m.STARTER;
  return (
    <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700, background: c.bg, color: c.color }}>
      {tier}
    </span>
  );
}

export default function LicenseKeysPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('PRO');
  const [expiresInDays, setExpiresInDays] = useState('365');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setData(await adminApi.getLicenseKeys()); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    setCreating(true);
    try {
      const expiresAt = expiresInDays ? new Date(Date.now() + parseInt(expiresInDays) * 86400000).toISOString() : undefined;
      await adminApi.createLicenseKey(tier, expiresAt);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setCreating(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this license key? This cannot be undone.')) return;
    try { await adminApi.revokeKey(id); load(); }
    catch (e: any) { alert(e.message); }
  };

  const copyKey = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fade-in">
      {/* Generate form */}
      <div style={{
        background: C.card, border: `1px solid ${C.cardBorder}`,
        borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '1.25rem' }}>
          🔑 Generate New License Key
        </h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tier</label>
            <select value={tier} onChange={e => setTier(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {['STARTER', 'PRO', 'ENTERPRISE'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Expires In (days)
            </label>
            <input
              value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)}
              placeholder="365" type="number" style={{ ...inputStyle, width: '140px' }}
              onFocus={e => { e.target.style.borderColor = C.blue; }}
              onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
            />
          </div>
          <button
            onClick={createKey} disabled={creating}
            style={{
              padding: '0.75rem 1.5rem',
              background: creating ? 'rgba(16,185,129,0.5)' : C.green,
              color: '#fff', border: 'none', borderRadius: '10px',
              cursor: creating ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.875rem',
              boxShadow: creating ? 'none' : '0 4px 12px rgba(16,185,129,0.3)',
              transition: 'all 0.15s',
            }}>
            {creating ? '⏳ Generating…' : '✨ Generate Key'}
          </button>
        </div>
      </div>

      {/* Keys table */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>All License Keys</h3>
          <span style={{ fontSize: '0.75rem', color: C.textMuted }}>{data?.keys?.length ?? 0} keys</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0a0f1e' }}>
                {['Key', 'Tier', 'Business', 'Status', 'Expires', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '0.875rem 1.25rem', textAlign: 'left',
                    fontSize: '0.6875rem', color: C.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>Loading…</td></tr>
              )}
              {!loading && data?.keys?.map((k: any) => (
                <tr key={k.id} style={{ borderTop: `1px solid ${C.cardBorder}`, transition: 'background 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <code style={{ color: '#60a5fa', fontSize: '0.8125rem', fontFamily: 'monospace', background: 'rgba(59,130,246,0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                        {k.key}
                      </code>
                      <button onClick={() => copyKey(k.key, k.id)} style={{
                        padding: '2px 8px', background: copiedId === k.id ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                        color: copiedId === k.id ? C.green : '#93c5fd',
                        border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600,
                        transition: 'all 0.2s',
                      }}>
                        {copiedId === k.id ? '✓' : '📋'}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}><TierBadge tier={k.tier} /></td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem' }}>{k.businessId ?? '—'}</td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700,
                      background: k.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: k.isActive ? C.green : C.red,
                    }}>
                      {k.isActive ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem' }}>
                    {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem' }}>
                    {new Date(k.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    {k.isActive && (
                      <button onClick={() => revoke(k.id)} style={{
                        padding: '0.3rem 0.75rem',
                        background: 'rgba(239,68,68,0.12)', color: C.red,
                        border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                      }}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !data?.keys?.length && (
            <div style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔑</div>
              No license keys generated yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
