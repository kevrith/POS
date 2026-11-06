import { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';
import { C } from '../generated/tokens';


function Icon({ d, size = 16, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const Icons = {
  shield:  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  plus:    'M12 5v14 M5 12h14',
  trash:   'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  info:    'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z M12 16v-4 M12 8h.01',
  clock:   'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z M12 6v6l4 2',
};

export default function PlatformSettingsPage() {
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingWL, setLoadingWL] = useState(true);
  const [loadingAL, setLoadingAL] = useState(true);
  const [newIp, setNewIp] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);

  const loadWL  = () => {
    setLoadingWL(true);
    adminApi.getIpWhitelist().then(setWhitelist).catch(console.error).finally(() => setLoadingWL(false));
  };
  const loadAL = () => {
    setLoadingAL(true);
    adminApi.getSuperAdminAuditLog(auditPage).then((d: any) => {
      setAuditLogs(d.logs ?? []);
      setAuditTotal(d.total ?? 0);
    }).catch(console.error).finally(() => setLoadingAL(false));
  };

  useEffect(() => { loadWL(); }, []);
  useEffect(() => { loadAL(); }, [auditPage]);

  const flash = (m: string, type: 'ok' | 'err' = 'ok') => {
    setMsg(m); setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  const addIp = async () => {
    if (!newIp.trim()) return;
    setAdding(true);
    try {
      await adminApi.addIp(newIp.trim(), newLabel.trim() || undefined);
      setNewIp(''); setNewLabel('');
      flash(`${newIp} added to whitelist`);
      loadWL();
    } catch (e) { flash(String(e), 'err'); }
    finally { setAdding(false); }
  };

  const removeIp = async (id: string, ip: string) => {
    setRemoving(id);
    try {
      await adminApi.removeIp(id);
      flash(`${ip} removed`);
      loadWL();
    } catch (e) { flash(String(e), 'err'); }
    finally { setRemoving(null); }
  };

  const auditTotalPages = Math.ceil(auditTotal / 50);

  const ACTION_COLOR: Record<string, string> = {
    impersonate: C.amber, cancel_subscription: C.red,
    bulk_update_subscriptions: C.blue, delete_user: C.red,
    reset_password: C.amber, unlock_user: C.green,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Section header */}
      <div>
        <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
          Platform Settings
        </div>
        <div style={{ fontSize: '0.8125rem', color: C.textMuted }}>IP whitelist & super-admin audit trail</div>
      </div>

      {msg && (
        <div style={{
          background: msgType === 'ok' ? `${C.green}1a` : `${C.red}1a`,
          border: `1px solid ${msgType === 'ok' ? `${C.green}40` : `${C.red}40`}`,
          borderRadius: 8, padding: '0.75rem 1rem',
          color: msgType === 'ok' ? C.green : C.red,
          fontSize: '0.8125rem',
        }}>{msg}</div>
      )}

      {/* IP Whitelist */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Icon d={Icons.shield} size={16} color={C.green} />
              <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>IP Whitelist</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: C.textMuted }}>
              {whitelist.length === 0
                ? 'Empty — all IPs allowed. Add IPs to restrict super-admin access.'
                : `${whitelist.length} IP(s) allowed. All others will be blocked.`}
            </div>
          </div>
          <span style={{
            fontSize: '0.6875rem', fontWeight: 700, padding: '2px 10px', borderRadius: 20,
            color: whitelist.length === 0 ? C.amber : C.green,
            background: whitelist.length === 0 ? `${C.amber}1a` : `${C.green}1a`,
            border: `1px solid ${whitelist.length === 0 ? `${C.amber}40` : `${C.green}40`}`,
          }}>
            {whitelist.length === 0 ? 'OPEN' : 'RESTRICTED'}
          </span>
        </div>

        {/* Add form */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input value={newIp} onChange={e => setNewIp(e.target.value)}
            placeholder="IP address (e.g. 102.0.12.5)"
            onKeyDown={e => e.key === 'Enter' && addIp()}
            style={{ flex: '1 1 160px', padding: '0.5rem 0.75rem', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.text, fontSize: '0.8125rem', outline: 'none' }} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Label (optional, e.g. Office)"
            style={{ flex: '1 1 140px', padding: '0.5rem 0.75rem', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.text, fontSize: '0.8125rem', outline: 'none' }} />
          <button onClick={addIp} disabled={adding || !newIp.trim()} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', borderRadius: 8, border: 'none',
            background: newIp.trim() ? C.green : C.cardBorder,
            color: '#fff', cursor: newIp.trim() ? 'pointer' : 'not-allowed',
            fontSize: '0.8125rem', fontWeight: 600, transition: 'background 0.15s',
          }}>
            <Icon d={Icons.plus} size={13} color="#fff" />
            {adding ? 'Adding…' : 'Add IP'}
          </button>
        </div>

        {/* List */}
        {loadingWL ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>Loading…</div>
        ) : whitelist.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>
            <Icon d={Icons.info} size={24} color={C.textMuted} />
            <div style={{ marginTop: 8, fontSize: '0.875rem' }}>No IPs whitelisted — all connections allowed.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {['IP Address', 'Label', 'Added By', 'Added At', ''].map(h => (
                  <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${C.cardBorder}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {whitelist.map((entry: any, i: number) => (
                <tr key={entry.id} style={{ borderBottom: i < whitelist.length - 1 ? `1px solid ${C.cardBorder}` : 'none' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = `${C.blue}0a`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: C.green, fontSize: '0.875rem', fontFamily: 'monospace' }}>{entry.ip}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.textSecondary, fontSize: '0.8125rem' }}>{entry.label ?? '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.textMuted, fontSize: '0.75rem' }}>{entry.addedBy ?? '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.textMuted, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {new Date(entry.createdAt).toLocaleDateString('en-KE')}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <button onClick={() => removeIp(entry.id, entry.ip)} disabled={removing === entry.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.red}30`, background: `${C.red}14`, color: C.red, cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600 }}>
                      <Icon d={Icons.trash} size={11} color={C.red} />
                      {removing === entry.id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Super-Admin Audit Log */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon d={Icons.clock} size={16} color={C.blue} />
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Super-Admin Audit Log</div>
              <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: 2 }}>{auditTotal} actions recorded</div>
            </div>
          </div>
          <button onClick={loadAL} style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: 'pointer', fontSize: '0.75rem' }}>
            Refresh
          </button>
        </div>

        {loadingAL ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>Loading audit log…</div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted, fontSize: '0.875rem' }}>No audit entries yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {['Admin', 'Action', 'Target', 'IP', 'Details', 'Time'].map(h => (
                    <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${C.cardBorder}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log: any, i: number) => {
                  const actionColor = ACTION_COLOR[log.action] ?? C.textSecondary;
                  return (
                    <tr key={log.id} style={{ borderBottom: i < auditLogs.length - 1 ? `1px solid ${C.cardBorder}` : 'none' }}>
                      <td style={{ padding: '0.625rem 1rem', color: C.textSecondary, fontSize: '0.75rem' }}>{log.adminEmail}</td>
                      <td style={{ padding: '0.625rem 1rem' }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: actionColor, background: `${actionColor}15`, border: `1px solid ${actionColor}30`, padding: '1px 8px', borderRadius: 10 }}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '0.625rem 1rem', color: C.textMuted, fontSize: '0.6875rem', fontFamily: 'monospace' }}>
                        {log.targetType && <span style={{ color: C.textSecondary }}>{log.targetType}: </span>}
                        {log.targetId ? log.targetId.slice(0, 16) + '…' : '—'}
                      </td>
                      <td style={{ padding: '0.625rem 1rem', color: C.textMuted, fontSize: '0.6875rem', fontFamily: 'monospace' }}>{log.ipAddress ?? '—'}</td>
                      <td style={{ padding: '0.625rem 1rem', color: C.textMuted, fontSize: '0.6875rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.details ? log.details.slice(0, 60) : '—'}
                      </td>
                      <td style={{ padding: '0.625rem 1rem', color: C.textMuted, fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {auditTotalPages > 1 && (
          <div style={{ padding: '0.75rem 1.5rem', borderTop: `1px solid ${C.cardBorder}`, display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <button onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1}
              style={{ padding: '4px 14px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: 'pointer', opacity: auditPage === 1 ? 0.4 : 1, fontSize: '0.75rem' }}>Prev</button>
            <span style={{ padding: '4px 10px', color: C.textMuted, fontSize: '0.75rem' }}>{auditPage} / {auditTotalPages}</span>
            <button onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))} disabled={auditPage === auditTotalPages}
              style={{ padding: '4px 14px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: 'pointer', opacity: auditPage === auditTotalPages ? 0.4 : 1, fontSize: '0.75rem' }}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
