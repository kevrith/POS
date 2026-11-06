import { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';
import { C } from '../generated/tokens';
import { KeyRound } from 'lucide-react';


const inputStyle: React.CSSProperties = {
  padding: '0.75rem 1rem', background: C.input,
  border: `1px solid ${C.inputBorder}`,
  borderRadius: '10px', color: C.text, fontSize: '0.875rem', outline: 'none',
};

function TierBadge({ tier }: { tier: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    LIFETIME:   { bg: `${C.amber}26`,  color: C.amber },
    ENTERPRISE: { bg: `${C.purple}1f`, color: C.purple },
    PRO:        { bg: `${C.blue}1f`,  color: C.blue },
    GROWTH:     { bg: `${C.cyan}1f`,   color: C.accentText },
    STARTER:    { bg: `${C.textMuted}1f`, color: C.textMuted },
    FREE:       { bg: `${C.green}1f`,  color: C.green },
  };
  const c = m[tier] ?? m.FREE;
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
  const [actionLoading, setActionLoading] = useState<string | null>(null); // keyId + action

  // Machine-bound key generator
  const [mbMachineId, setMbMachineId] = useState('');
  const [mbTier, setMbTier] = useState('PRO');
  const [mbExpires, setMbExpires] = useState('365');
  const [mbCreating, setMbCreating] = useState(false);
  const [mbResult, setMbResult] = useState<string | null>(null);
  const [mbCopied, setMbCopied] = useState(false);

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
      const expiresAt = (tier === 'LIFETIME' || !expiresInDays) ? undefined : new Date(Date.now() + parseInt(expiresInDays) * 86400000).toISOString();
      await adminApi.createLicenseKey(tier, expiresAt);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setCreating(false); }
  };

  const createMachineBoundKey = async () => {
    if (!mbMachineId.trim()) { alert('Enter the customer machine ID'); return; }
    setMbCreating(true);
    setMbResult(null);
    try {
      const expiresAt = (mbTier === 'LIFETIME' || !mbExpires) ? undefined : new Date(Date.now() + parseInt(mbExpires) * 86400000).toISOString();
      const res = await adminApi.createMachineBoundKey(mbMachineId.trim(), mbTier, expiresAt);
      setMbResult(res.key);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setMbCreating(false); }
  };

  const copyMbKey = async () => {
    if (!mbResult) return;
    await navigator.clipboard.writeText(mbResult);
    setMbCopied(true);
    setTimeout(() => setMbCopied(false), 2000);
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this license key? This cannot be undone.')) return;
    try { await adminApi.revokeKey(id); load(); }
    catch (e: any) { alert(e.message); }
  };

  const resend = async (id: string) => {
    setActionLoading(`${id}-resend`);
    try {
      const res = await adminApi.resendLicenseKey(id);
      alert(`License key email sent to ${res.sentTo}`);
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const regenerate = async (id: string) => {
    if (!confirm('Revoke this key and generate a new one? The new key will be emailed to the business owner.')) return;
    setActionLoading(`${id}-regen`);
    try {
      const res = await adminApi.regenerateLicenseKey(id);
      alert(`New key generated and sent to ${res.sentTo}\n\nNew key: ${res.newKey}`);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const copyKey = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fade-in">
      {/* Two-column generator panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* Generic key */}
        <div style={{
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: '14px', padding: '1.5rem',
        }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '0.375rem' }}>
            Generic License Key
          </h3>
          <p style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: '1.25rem' }}>
            Not machine-bound. Works on any device. Use for trials or testing.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tier</label>
              <select value={tier} onChange={e => setTier(e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                {['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'LIFETIME'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Expires In (days)
              </label>
              {tier === 'LIFETIME' ? (
                <div style={{ ...inputStyle, width: '100%', color: C.amber, background: `${C.amber}12`, border: `1px solid ${C.amber}4c`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Never expires
                </div>
              ) : (
                <input
                  value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)}
                  placeholder="365" type="number" style={{ ...inputStyle, width: '100%' }}
                  onFocus={e => { e.target.style.borderColor = C.blue; }}
                  onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
                />
              )}
            </div>
            <button
              onClick={createKey} disabled={creating}
              style={{
                padding: '0.75rem 1.5rem',
                background: creating ? `${C.green}80` : C.green,
                color: '#fff', border: 'none', borderRadius: '10px',
                cursor: creating ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: '0.875rem',
                boxShadow: creating ? 'none' : `0 4px 12px ${C.green}4c`,
                transition: 'all 0.15s',
              }}>
              {creating ? 'Generating…' : 'Generate Generic Key'}
            </button>
          </div>
        </div>

        {/* Machine-bound key */}
        <div style={{
          background: C.card, border: `1px solid ${C.purple}40`,
          borderRadius: '14px', padding: '1.5rem',
        }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '0.375rem' }}>
            Machine-Bound Key
          </h3>
          <p style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: '1.25rem' }}>
            Tied to a specific device. Customer finds their Machine ID in the desktop setup wizard.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Customer Machine ID
              </label>
              <input
                value={mbMachineId} onChange={e => setMbMachineId(e.target.value)}
                placeholder="e.g. a1b2c3d4e5f6… (from desktop wizard)"
                style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontSize: '0.8125rem' }}
                onFocus={e => { e.target.style.borderColor = C.purple; }}
                onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tier</label>
                <select value={mbTier} onChange={e => setMbTier(e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                  {['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'LIFETIME'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Days</label>
                {mbTier === 'LIFETIME' ? (
                  <div style={{ ...inputStyle, color: C.amber, background: `${C.amber}12`, border: `1px solid ${C.amber}4c`, display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem' }}>
                    Never
                  </div>
                ) : (
                  <input
                    value={mbExpires} onChange={e => setMbExpires(e.target.value)}
                    placeholder="365" type="number" style={{ ...inputStyle, width: '100%' }}
                    onFocus={e => { e.target.style.borderColor = C.purple; }}
                    onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
                  />
                )}
              </div>
            </div>
            <button
              onClick={createMachineBoundKey} disabled={mbCreating}
              style={{
                padding: '0.75rem 1.5rem',
                background: mbCreating ? `${C.purple}80` : C.purple,
                color: '#fff', border: 'none', borderRadius: '10px',
                cursor: mbCreating ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: '0.875rem',
                boxShadow: mbCreating ? 'none' : `0 4px 12px ${C.purple}4c`,
                transition: 'all 0.15s',
              }}>
              {mbCreating ? 'Generating…' : 'Generate Machine-Bound Key'}
            </button>

            {/* Result */}
            {mbResult && (
              <div style={{
                background: `${C.purple}14`, border: `1px solid ${C.purple}40`,
                borderRadius: '10px', padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
              }}>
                <code style={{ flex: 1, color: C.purple, fontSize: '0.875rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {mbResult}
                </code>
                <button onClick={copyMbKey} style={{
                  padding: '0.4rem 0.75rem', flexShrink: 0,
                  background: mbCopied ? `${C.green}26` : `${C.purple}26`,
                  color: mbCopied ? C.green : C.purple,
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700,
                }}>
                  {mbCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
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
              <tr style={{ background: C.surface }}>
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
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = `${C.text}05`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <code style={{ color: C.accentText, fontSize: '0.8125rem', fontFamily: 'monospace', background: `${C.blue}14`, padding: '2px 8px', borderRadius: '6px' }}>
                        {k.key}
                      </code>
                      <button onClick={() => copyKey(k.key, k.id)} style={{
                        padding: '2px 8px', background: copiedId === k.id ? `${C.green}26` : `${C.blue}26`,
                        color: copiedId === k.id ? C.green : C.accentText,
                        border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600,
                        transition: 'all 0.2s',
                      }}>
                        {copiedId === k.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}><TierBadge tier={k.tier} /></td>
                  <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8125rem' }}>
                    {k.business ? (
                      <div>
                        <div style={{ color: C.text, fontWeight: 600 }}>{k.business.name}</div>
                        <div style={{ color: C.textMuted, fontSize: '0.75rem' }}>{k.business.users?.[0]?.email ?? ''}</div>
                      </div>
                    ) : (
                      <span style={{ color: C.textMuted }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700,
                      background: k.isActive ? `${C.green}1f` : `${C.red}1f`,
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
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      {k.isActive && k.businessId && (
                        <button
                          onClick={() => resend(k.id)}
                          disabled={actionLoading === `${k.id}-resend`}
                          title="Re-email the existing key to the business owner"
                          style={{
                            padding: '0.3rem 0.625rem',
                            background: `${C.blue}1f`, color: C.accentText,
                            border: 'none', borderRadius: '6px', cursor: actionLoading === `${k.id}-resend` ? 'not-allowed' : 'pointer',
                            fontSize: '0.6875rem', fontWeight: 600, opacity: actionLoading === `${k.id}-resend` ? 0.6 : 1,
                          }}>
                          {actionLoading === `${k.id}-resend` ? '…' : 'Resend'}
                        </button>
                      )}
                      {k.isActive && k.businessId && (
                        <button
                          onClick={() => regenerate(k.id)}
                          disabled={!!actionLoading}
                          title="Revoke this key and issue a new one, then email the new key to the owner"
                          style={{
                            padding: '0.3rem 0.625rem',
                            background: `${C.amber}1f`, color: C.amber,
                            border: 'none', borderRadius: '6px', cursor: actionLoading === `${k.id}-regen` ? 'not-allowed' : 'pointer',
                            fontSize: '0.6875rem', fontWeight: 600, opacity: actionLoading === `${k.id}-regen` ? 0.6 : 1,
                          }}>
                          {actionLoading === `${k.id}-regen` ? '…' : 'Regen'}
                        </button>
                      )}
                      {k.isActive && (
                        <button onClick={() => revoke(k.id)} style={{
                          padding: '0.3rem 0.625rem',
                          background: `${C.red}1f`, color: C.red,
                          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600,
                        }}>
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !data?.keys?.length && (
            <div style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
              <KeyRound size={32} aria-hidden style={{ marginBottom: '0.5rem', color: C.textMuted }} />
              No license keys generated yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
