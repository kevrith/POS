import { useState, useEffect, useCallback } from 'react';
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
  link:    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  retry:   'M1 4v6h6 M23 20v-6h-6 M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15',
  check:   'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  alert:   'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  toggle:  'M18 20V10 M12 20V4 M6 20v-6',
};

export default function WebhooksPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getWebhooks(page).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const webhooks: any[] = data?.webhooks ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await adminApi.retryWebhook(id);
      setMsg('Webhook failure count reset. Will retry on next event.');
      load();
    } catch (e) { setMsg('Failed: ' + String(e)); }
    finally { setRetrying(null); setTimeout(() => setMsg(''), 4000); }
  };

  const toggle = async (id: string, isActive: boolean) => {
    setToggling(id);
    try {
      await adminApi.toggleWebhook(id, isActive);
      load();
    } catch (e) { setMsg('Failed: ' + String(e)); }
    finally { setToggling(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
            Webhook Management
          </div>
          <div style={{ fontSize: '0.8125rem', color: C.textMuted }}>
            All registered webhooks across businesses · {total} total
          </div>
        </div>
        <button onClick={load} style={{
          padding: '0.5rem 1rem', borderRadius: 8, border: `1px solid ${C.cardBorder}`,
          background: C.surface, color: C.textSecondary, cursor: 'pointer', fontSize: '0.8125rem',
        }}>
          Refresh
        </button>
      </div>

      {msg && (
        <div style={{ background: `${C.green}1a`, border: `1px solid ${C.green}40`, borderRadius: 8, padding: '0.75rem 1rem', color: C.green, fontSize: '0.8125rem' }}>
          {msg}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Webhooks',  value: total,                                              color: C.blue },
          { label: 'Active',          value: webhooks.filter(w => w.isActive).length,            color: C.green },
          { label: 'Disabled',        value: webhooks.filter(w => !w.isActive).length,           color: C.textMuted },
          { label: 'With Failures',   value: webhooks.filter(w => w.failureCount > 0).length,    color: C.red },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>Loading webhooks…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {['Business', 'URL', 'Events', 'Status', 'Failures', 'Last Fired', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.cardBorder}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w: any, i: number) => {
                  let events: string[] = [];
                  try { events = JSON.parse(w.events); } catch { events = [w.events]; }
                  return (
                    <tr key={w.id} style={{ borderBottom: i < webhooks.length - 1 ? `1px solid ${C.cardBorder}` : 'none' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = `${C.blue}0a`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: C.text, fontSize: '0.8125rem' }}>{w.business?.name ?? '—'}</div>
                        <div style={{ fontSize: '0.6875rem', color: C.textMuted }}>{w.business?.id?.slice(0,12)}…</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', maxWidth: 200 }}>
                        <div style={{ fontSize: '0.75rem', color: C.blue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {w.url}
                        </div>
                        {w.description && <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginTop: 2 }}>{w.description}</div>}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {events.slice(0, 3).map((ev: string) => (
                            <span key={ev} style={{ fontSize: '0.5625rem', background: `${C.blue}1a`, color: C.blue, border: `1px solid ${C.blue}33`, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                              {ev}
                            </span>
                          ))}
                          {events.length > 3 && <span style={{ fontSize: '0.5625rem', color: C.textMuted }}>+{events.length - 3}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{
                          fontSize: '0.6875rem', fontWeight: 700,
                          color: w.isActive ? C.green : C.textMuted,
                          background: w.isActive ? `${C.green}1a` : `${C.textMuted}1a`,
                          border: `1px solid ${w.isActive ? `${C.green}40` : `${C.textMuted}40`}`,
                          padding: '2px 8px', borderRadius: 10,
                        }}>
                          {w.isActive ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                        {w.failureCount > 0 ? (
                          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: C.red }}>{w.failureCount}</span>
                        ) : (
                          <Icon d={Icons.check} size={14} color={C.green} />
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: C.textMuted, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {w.lastFiredAt ? new Date(w.lastFiredAt).toLocaleDateString('en-KE') : 'Never'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {w.failureCount > 0 && (
                            <button onClick={() => retry(w.id)} disabled={retrying === w.id}
                              title="Reset failure count"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.amber}`, background: `${C.amber}1a`, color: C.amber, cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600 }}>
                              <Icon d={Icons.retry} size={11} color={C.amber} />
                              {retrying === w.id ? '…' : 'Retry'}
                            </button>
                          )}
                          <button onClick={() => toggle(w.id, !w.isActive)} disabled={toggling === w.id}
                            title={w.isActive ? 'Disable webhook' : 'Enable webhook'}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: 'pointer', fontSize: '0.6875rem' }}>
                            <Icon d={Icons.toggle} size={11} />
                            {toggling === w.id ? '…' : w.isActive ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {webhooks.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>No webhooks registered yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}>Prev</button>
          <span style={{ padding: '6px 12px', color: C.textMuted, fontSize: '0.8125rem' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>Next</button>
        </div>
      )}
    </div>
  );
}
