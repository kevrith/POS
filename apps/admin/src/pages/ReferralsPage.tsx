import { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';
import { C } from '../generated/tokens';
import { Link2 } from 'lucide-react';


function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    CONVERTED: { bg: `${C.green}1f`,  color: C.green },
    REWARDED:  { bg: `${C.purple}1f`,  color: C.purple },
    PENDING:   { bg: `${C.amber}1f`,  color: C.amber },
  };
  const c = m[status] ?? m.PENDING;
  return (
    <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700, background: c.bg, color: c.color }}>
      {status}
    </span>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: C.surface, borderRadius: '12px', padding: '1rem 1.25rem',
      border: `1px solid ${C.cardBorder}`, flex: 1, minWidth: '120px',
    }}>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '4px' }}>{label}</div>
    </div>
  );
}

export default function ReferralsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try { setData(await adminApi.getReferrals(page)); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const getStatCount = (status: string) =>
    data?.stats?.find((s: any) => s.status === status)?._count?.id ?? 0;

  return (
    <div className="fade-in">
      {/* Stats row */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <StatMini label="Total Referrals" value={data?.total ?? 0}          color={C.blue} />
        <StatMini label="Pending"         value={getStatCount('PENDING')}   color={C.amber} />
        <StatMini label="Converted"       value={getStatCount('CONVERTED')} color={C.green} />
        <StatMini label="Rewarded"        value={getStatCount('REWARDED')}  color={C.purple} />
      </div>

      {/* How referrals work info */}
      <div style={{
        background: `${C.cyan}0d`, border: `1px solid ${C.cyan}26`,
        borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
        fontSize: '0.8125rem', color: C.textSecondary, lineHeight: 1.6,
      }}>
        <strong style={{ color: C.accentText }}>How it works:</strong> Each business owner gets a unique referral code (<code style={{ color: C.accentText }}>KAS-XXXXXX</code>). When a new business signs up using that code, the referral is marked <strong>CONVERTED</strong>. Both parties receive 1 month free (issued as a Paystack coupon). When the coupon is applied, the referral becomes <strong>REWARDED</strong>.
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>All Referrals</h3>
          <span style={{ fontSize: '0.75rem', color: C.textMuted }}>{data?.total ?? 0} total</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {['Referral Code', 'Referrer Business', 'Referred Business ID', 'Status', 'Reward', 'Date'].map(h => (
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
                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>Loading…</td></tr>
              )}
              {!loading && data?.referrals?.map((r: any) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.cardBorder}`, transition: 'background 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = `${C.text}05`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <code style={{ color: C.accentText, fontFamily: 'monospace', fontSize: '0.875rem', background: `${C.cyan}14`, padding: '2px 8px', borderRadius: '6px' }}>
                      {r.code}
                    </code>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.text, fontWeight: 600, fontSize: '0.875rem' }}>
                    {r.referrer?.name ?? r.referrerBusinessId}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                    {r.referredBusinessId ?? <span style={{ color: C.textSecondary, fontFamily: 'sans-serif' }}>Not yet claimed</span>}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '0.875rem 1.25rem', color: r.rewardCents > 0 ? C.green : C.textMuted, fontWeight: r.rewardCents > 0 ? 600 : 400, fontSize: '0.875rem' }}>
                    {r.rewardCents > 0 ? `KES ${(r.rewardCents / 100).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem' }}>
                    {new Date(r.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
              {!loading && !data?.referrals?.length && (
                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
                  <Link2 size={32} aria-hidden style={{ marginBottom: '0.5rem', color: C.textMuted }} />
                  No referrals yet
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', color: C.textMuted, fontSize: '0.8125rem' }}>
          <span>{data.total} total</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '0.3rem 0.75rem', background: `${C.text}0d`, color: C.textSecondary, border: 'none', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, fontSize: '0.8125rem', fontWeight: 600 }}>
              ← Prev
            </button>
            <span style={{ padding: '0.375rem 0.75rem', color: C.textSecondary, fontWeight: 600 }}>Page {page}</span>
            <button
              onClick={() => setPage(p => p + 1)} disabled={(data.referrals?.length ?? 0) < 20}
              style={{ padding: '0.3rem 0.75rem', background: `${C.text}0d`, color: C.textSecondary, border: 'none', borderRadius: '6px', cursor: (data.referrals?.length ?? 0) < 20 ? 'not-allowed' : 'pointer', opacity: (data.referrals?.length ?? 0) < 20 ? 0.4 : 1, fontSize: '0.8125rem', fontWeight: 600 }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
