import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import { C } from '../generated/tokens';

interface Install {
  id: string;
  machineId: string;
  hostname: string | null;
  os: string | null;
  appVersion: string;
  businessName: string | null;
  lastSeenAt: string;
  updateRequestedAt: string | null;
  updateRequestedFor: string | null;
  status: 'UP_TO_DATE' | 'BEHIND' | 'UNKNOWN';
}

interface InstallList {
  latestVersion: string | null;
  total: number;
  behind: number;
  requested: number;
  installs: Install[];
}

const SYSTEM: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
const STALE_DAYS = 30;

function ago(iso: string, now = Date.now()): { text: string; days: number } {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  if (minutes < 2) return { text: 'just now', days };
  if (minutes < 60) return { text: `${minutes} min ago`, days };
  if (minutes < 1440) return { text: `${Math.floor(minutes / 60)} h ago`, days };
  return { text: `${days} day${days === 1 ? '' : 's'} ago`, days };
}

function Pill({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Card({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1rem 1.25rem', minWidth: '10rem' }}>
      <div style={{ fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color ?? C.text, marginTop: '4px' }}>{value}</div>
    </div>
  );
}

/** Which version of the desktop app each computer runs, and a way to ask one to update. */
export default function DesktopAppsPage() {
  const [data, setData] = useState<InstallList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'BEHIND' | 'REQUESTED'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminApi.getDesktopInstalls()); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, what: 'request' | 'cancel' | 'remove') => {
    if (what === 'remove' && !confirm('Forget this computer? It will appear again by itself if it ever reports in.')) return;
    setBusy(`${id}-${what}`);
    try {
      if (what === 'request') await adminApi.requestDesktopUpdate(id);
      else if (what === 'cancel') await adminApi.cancelDesktopUpdate(id);
      else await adminApi.removeDesktopInstall(id);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(null); }
  };

  const rows = (data?.installs ?? []).filter((i) => filter === 'ALL' || (filter === 'BEHIND' ? i.status === 'BEHIND' : !!i.updateRequestedAt));
  const btn = (bg: string, color: string): React.CSSProperties => ({
    padding: '4px 10px', background: bg, color, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 700,
  });

  return (
    <div className="fade-in">
      <p style={{ fontSize: '0.8125rem', color: C.textMuted, maxWidth: '46rem', marginBottom: '1.25rem' }}>
        Each installed desktop app reports its version here every few hours while it has internet. <strong>Request update</strong> shows that computer a banner that stays until it is installed (an owner or manager presses install; nothing installs by itself). The request clears once the computer reports the newest version. Apps older than the version that added this report do not appear until they are updated once by hand.
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <Card label="Newest version" value={data?.latestVersion ?? 'unknown'} />
        <Card label="Computers" value={data?.total ?? 0} />
        <Card label="Behind" value={data?.behind ?? 0} color={data && data.behind > 0 ? C.amber : undefined} />
        <Card label="Update requested" value={data?.requested ?? 0} color={data && data.requested > 0 ? C.blue : undefined} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['ALL', 'BEHIND', 'REQUESTED'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 14px', borderRadius: '8px', border: `1px solid ${filter === f ? C.blue : C.cardBorder}`, cursor: 'pointer',
                background: filter === f ? `${C.blue}1f` : 'transparent', color: filter === f ? C.blue : C.textSecondary, fontSize: '0.75rem', fontWeight: 700,
              }}>{f === 'ALL' ? 'All' : f === 'BEHIND' ? 'Behind' : 'Requested'}</button>
            ))}
          </div>
          <button onClick={() => void load()} style={btn(`${C.blue}26`, C.accentText)}>Refresh</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {['Computer', 'Business', 'System', 'App version', 'Last seen', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '0.875rem 1.25rem', textAlign: 'left', fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
                  {data?.total ? 'No computers match this filter.' : 'No computer has reported in yet. They appear here once they run an app version that reports (and have internet).'}
                </td></tr>
              )}
              {!loading && rows.map((i) => {
                const seen = ago(i.lastSeenAt);
                return (
                  <tr key={i.id} style={{ borderTop: `1px solid ${C.cardBorder}` }}>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8125rem' }}>
                      <div style={{ color: C.text, fontWeight: 600 }}>{i.hostname ?? 'Unnamed computer'}</div>
                      <div style={{ color: C.textMuted, fontSize: '0.6875rem', fontFamily: 'monospace' }}>{i.machineId.slice(0, 8)}…</div>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8125rem', color: C.text }}>{i.businessName ?? <span style={{ color: C.textMuted }}>not reported</span>}</td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8125rem', color: C.textSecondary }}>{SYSTEM[i.os ?? ''] ?? i.os ?? 'Unknown'}</td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <code style={{ fontSize: '0.8125rem', color: C.text, fontWeight: 700 }}>{i.appVersion}</code>
                        {i.status === 'UP_TO_DATE' && <Pill bg={`${C.green}1f`} color={C.green}>Up to date</Pill>}
                        {i.status === 'BEHIND' && <Pill bg={`${C.amber}26`} color={C.amber}>Behind</Pill>}
                        {i.updateRequestedAt && <Pill bg={`${C.blue}1f`} color={C.blue}>Update requested</Pill>}
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8125rem', color: seen.days >= STALE_DAYS ? C.red : C.textSecondary }}>
                      {seen.text}{seen.days >= STALE_DAYS ? ' (not seen for a long time)' : ''}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        {i.updateRequestedAt ? (
                          <button disabled={busy === `${i.id}-cancel`} onClick={() => void act(i.id, 'cancel')} style={btn(`${C.amber}26`, C.amber)}>Cancel request</button>
                        ) : (
                          i.status !== 'UP_TO_DATE' && <button disabled={busy === `${i.id}-request`} onClick={() => void act(i.id, 'request')} style={btn(`${C.blue}26`, C.accentText)}>Request update</button>
                        )}
                        <button disabled={busy === `${i.id}-remove`} onClick={() => void act(i.id, 'remove')} style={btn(`${C.red}1f`, C.red)}>Forget</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
