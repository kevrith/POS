import { useState } from 'react';
import { adminApi } from '../lib/api';

const C = {
  card: '#111827', cardBorder: '#1e293b',
  text: '#f1f5f9', textMuted: '#64748b', textSecondary: '#94a3b8',
  input: '#020617', inputBorder: '#1e293b',
  blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.75rem 1rem',
  background: C.input, border: `1px solid ${C.inputBorder}`,
  borderRadius: '10px', color: C.text, fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600,
  color: C.textMuted, marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

function MetaItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      background: '#0a0f1e', borderRadius: '10px', padding: '0.875rem 1rem',
      border: `1px solid ${C.cardBorder}`,
    }}>
      <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '0.9375rem', color: C.text, fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}

export default function SupportPage() {
  const [bizId, setBizId] = useState('');
  const [bizData, setBizData] = useState<any>(null);
  const [bizLoading, setBizLoading] = useState(false);
  const [bizError, setBizError] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [showAudit, setShowAudit] = useState(false);

  const [fuVersion, setFuVersion] = useState('');
  const [fuMessage, setFuMessage] = useState('');
  const [fuRequired, setFuRequired] = useState(false);
  const [fuStatus, setFuStatus] = useState('');
  const [fuLoading, setFuLoading] = useState(false);

  const lookupBiz = async () => {
    if (!bizId.trim()) return;
    setBizLoading(true); setBizError(''); setBizData(null); setAuditLogs(null); setShowAudit(false);
    try { setBizData(await adminApi.getBusinessData(bizId.trim())); }
    catch (e: any) { setBizError(e.message ?? 'Not found'); }
    finally { setBizLoading(false); }
  };

  const loadAuditLog = async (page = 1) => {
    if (!bizId.trim()) return;
    setAuditLoading(true);
    try {
      const d = await adminApi.getBusinessAuditLog(bizId.trim(), page);
      setAuditLogs(d.logs ?? []);
      setAuditTotal(d.total ?? 0);
      setAuditPage(page);
      setShowAudit(true);
    } catch (e: any) { console.error(e); }
    finally { setAuditLoading(false); }
  };

  const submitForceUpdate = async () => {
    if (!fuVersion.trim() || !fuMessage.trim()) return;
    setFuLoading(true); setFuStatus('');
    try {
      await adminApi.triggerForceUpdate(fuVersion.trim(), fuMessage.trim(), fuRequired);
      setFuStatus('Force update notification sent to all businesses.');
      setFuVersion(''); setFuMessage(''); setFuRequired(false);
    } catch (e: any) {
      setFuStatus(`Error: ${e.message}`);
    } finally { setFuLoading(false); }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Business Inspector */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🔍</span>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Business Data Inspector</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Business ID</label>
            <input
              style={inputStyle} value={bizId}
              onChange={e => setBizId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupBiz()}
              placeholder="biz-..."
              onFocus={e => { e.target.style.borderColor = C.blue; }}
              onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
            />
          </div>
          <button
            onClick={lookupBiz} disabled={bizLoading || !bizId.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              background: (bizLoading || !bizId.trim()) ? 'rgba(59,130,246,0.4)' : C.blue,
              color: '#fff', border: 'none', borderRadius: '10px',
              cursor: (bizLoading || !bizId.trim()) ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.875rem', flexShrink: 0,
            }}>
            {bizLoading ? '⏳ Loading…' : '🔍 Inspect'}
          </button>
        </div>

        {bizError && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px', padding: '0.75rem 1rem',
            color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1rem',
          }}>{bizError}</div>
        )}

        {bizData && (
          <div className="slide-in">
            {/* Summary grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <MetaItem label="Business" value={bizData.business?.name} />
              <MetaItem label="Plan" value={bizData.business?.planName ?? bizData.business?.subscriptionTier ?? '—'} />
              <MetaItem label="Status" value={bizData.business?.subscriptionStatus} />
              <MetaItem label="Trial Ends" value={bizData.business?.trialEndsAt ? new Date(bizData.business.trialEndsAt).toLocaleDateString() : '—'} />
              <MetaItem label="Stores" value={bizData.storeCount ?? 0} />
              <MetaItem label="Users" value={bizData.userCount ?? bizData.users?.length ?? 0} />
              <MetaItem label="Items" value={bizData.itemCount ?? 0} />
              <MetaItem label="Sales (30d)" value={bizData.recentSalesCount ?? 0} />
              <MetaItem label="GMV (30d)" value={`KES ${((bizData.recentGMVCents ?? 0) / 100).toLocaleString()}`} />
            </div>

            {/* Recent sales */}
            {bizData.recentSales?.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                  Last 5 Sales
                </div>
                <div style={{ background: '#0a0f1e', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${C.cardBorder}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#020617' }}>
                        {['Receipt', 'Total', 'Status', 'Date'].map(h => (
                          <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', color: C.textMuted, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bizData.recentSales.map((s: any) => (
                        <tr key={s.id} style={{ borderTop: `1px solid ${C.cardBorder}` }}>
                          <td style={{ padding: '0.625rem 1rem', color: C.textSecondary, fontSize: '0.8125rem', fontFamily: 'monospace' }}>{s.receiptNumber}</td>
                          <td style={{ padding: '0.625rem 1rem', color: C.text, fontWeight: 600 }}>KES {((s.totalCents ?? 0) / 100).toLocaleString()}</td>
                          <td style={{ padding: '0.625rem 1rem' }}>
                            <span style={{ color: s.status === 'PAID' ? C.green : C.amber, fontWeight: 600, fontSize: '0.8125rem' }}>{s.status}</span>
                          </td>
                          <td style={{ padding: '0.625rem 1rem', color: C.textMuted, fontSize: '0.8125rem' }}>{new Date(s.createdAt).toLocaleString('en-KE')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Users */}
            {bizData.users?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                  Users ({bizData.users.length})
                </div>
                <div style={{ background: '#0a0f1e', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${C.cardBorder}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#020617' }}>
                        {['Name', 'Email', 'Role'].map(h => (
                          <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', color: C.textMuted, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bizData.users.map((u: any) => (
                        <tr key={u.id} style={{ borderTop: `1px solid ${C.cardBorder}` }}>
                          <td style={{ padding: '0.625rem 1rem', color: C.text, fontWeight: 600 }}>{u.name}</td>
                          <td style={{ padding: '0.625rem 1rem', color: C.textSecondary, fontSize: '0.8125rem' }}>{u.email}</td>
                          <td style={{ padding: '0.625rem 1rem' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700, background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}>
                              {u.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Audit Log button */}
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${C.cardBorder}` }}>
              <button onClick={() => showAudit ? setShowAudit(false) : loadAuditLog(1)}
                style={{ padding: '0.5rem 1rem', borderRadius: 8, border: `1px solid ${C.blue}40`, background: 'rgba(59,130,246,0.08)', color: C.blue, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                {showAudit ? 'Hide Audit Log' : '📋 View Business Audit Log'}
              </button>

              {showAudit && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                    Audit Log ({auditTotal} entries)
                  </div>
                  {auditLoading ? (
                    <div style={{ color: C.textMuted, fontSize: '0.8125rem', padding: '1rem 0' }}>Loading…</div>
                  ) : auditLogs && auditLogs.length === 0 ? (
                    <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>No audit entries recorded for this business.</div>
                  ) : (
                    <div style={{ background: '#0a0f1e', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${C.cardBorder}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#020617' }}>
                            {['Actor', 'Action', 'Entity', 'Time'].map(h => (
                              <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', color: C.textMuted, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(auditLogs ?? []).map((log: any) => (
                            <tr key={log.id} style={{ borderTop: `1px solid ${C.cardBorder}` }}>
                              <td style={{ padding: '0.625rem 1rem', color: C.textSecondary, fontSize: '0.75rem' }}>{log.actor} <span style={{ color: C.textMuted }}>({log.actorType})</span></td>
                              <td style={{ padding: '0.625rem 1rem', color: C.blue, fontSize: '0.75rem', fontWeight: 600 }}>{log.action}</td>
                              <td style={{ padding: '0.625rem 1rem', color: C.textMuted, fontSize: '0.75rem' }}>{log.entityType} {log.entityId ? `#${log.entityId.slice(0,8)}` : ''}</td>
                              <td style={{ padding: '0.625rem 1rem', color: C.textMuted, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                {new Date(log.createdAt).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {auditTotal > 50 && (
                        <div style={{ padding: '0.75rem 1rem', borderTop: `1px solid ${C.cardBorder}`, display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button onClick={() => loadAuditLog(Math.max(1, auditPage - 1))} disabled={auditPage === 1}
                            style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: '#0a0f1e', color: C.textSecondary, cursor: 'pointer', fontSize: '0.75rem', opacity: auditPage === 1 ? 0.4 : 1 }}>Prev</button>
                          <span style={{ fontSize: '0.75rem', color: C.textMuted, padding: '4px 8px' }}>{auditPage} / {Math.ceil(auditTotal / 50)}</span>
                          <button onClick={() => loadAuditLog(auditPage + 1)} disabled={auditPage >= Math.ceil(auditTotal / 50)}
                            style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: '#0a0f1e', color: C.textSecondary, cursor: 'pointer', fontSize: '0.75rem', opacity: auditPage >= Math.ceil(auditTotal / 50) ? 0.4 : 1 }}>Next</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Force Update */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🚀</span>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Force Update Notification</h3>
        </div>
        <p style={{ color: C.textMuted, fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          Send an update notification to all connected businesses. Desktop clients will display a changelog dialog.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Version</label>
            <input
              style={inputStyle} value={fuVersion}
              onChange={e => setFuVersion(e.target.value)}
              placeholder="1.2.0"
              onFocus={e => { e.target.style.borderColor = C.blue; }}
              onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
            />
          </div>
          <div>
            <label style={labelStyle}>Changelog / Message</label>
            <input
              style={inputStyle} value={fuMessage}
              onChange={e => setFuMessage(e.target.value)}
              placeholder="What's new in this version…"
              onFocus={e => { e.target.style.borderColor = C.blue; }}
              onBlur={e => { e.target.style.borderColor = C.inputBorder; }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: C.textSecondary, fontSize: '0.875rem', fontWeight: 500 }}>
            <input
              type="checkbox" checked={fuRequired}
              onChange={e => setFuRequired(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: C.red }}
            />
            Required (blocks app until updated)
          </label>
          <button
            onClick={submitForceUpdate}
            disabled={fuLoading || !fuVersion.trim() || !fuMessage.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              background: (fuLoading || !fuVersion.trim() || !fuMessage.trim())
                ? 'rgba(220,38,38,0.4)'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#fff', border: 'none', borderRadius: '10px',
              cursor: (fuLoading || !fuVersion.trim() || !fuMessage.trim()) ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.875rem',
              boxShadow: (fuLoading || !fuVersion.trim() || !fuMessage.trim()) ? 'none' : '0 4px 12px rgba(220,38,38,0.3)',
              transition: 'all 0.15s',
            }}>
            {fuLoading ? '⏳ Sending…' : '📢 Send Force Update'}
          </button>
        </div>

        {fuStatus && (
          <div style={{
            marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px',
            background: fuStatus.startsWith('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            border: `1px solid ${fuStatus.startsWith('Error') ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
            color: fuStatus.startsWith('Error') ? '#fca5a5' : '#6ee7b7',
            fontSize: '0.875rem', fontWeight: 500,
          }}>
            {fuStatus}
          </div>
        )}
      </div>
    </div>
  );
}
