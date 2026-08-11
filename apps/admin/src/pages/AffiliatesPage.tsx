import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../lib/api';

const C = {
  card: '#111827', cardBorder: '#1e293b',
  text: '#f1f5f9', textMuted: '#64748b', textSecondary: '#94a3b8',
  input: '#020617', inputBorder: '#1e293b',
  blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', red: '#ef4444', purple: '#8b5cf6',
};

interface Affiliate {
  id: string; name: string; email: string; phone?: string | null; code: string; status: string;
  commissionPercent: number; balanceCents: number; totalEarnedCents: number;
  payoutMethod?: string | null; payoutDetails?: string | null;
  _count?: { conversions: number };
}

const KES = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
const STATUS_COLOR: Record<string, string> = {
  PENDING: C.amber, ACTIVE: C.green, SUSPENDED: C.red, REJECTED: C.textMuted,
};

function Badge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? C.textMuted;
  return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.6875rem', fontWeight: 700, background: `${color}22`, color }}>{status}</span>;
}

export default function AffiliatesPage() {
  const [rows, setRows] = useState<Affiliate[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getAffiliates(filter).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); load(); } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }

  function approve(a: Affiliate) {
    const pct = prompt(`Commission % for ${a.name}?`, String(a.commissionPercent));
    if (pct === null) return;
    void act(a.id, () => adminApi.setAffiliateStatus(a.id, 'ACTIVE', Number(pct) || undefined));
  }
  function setStatus(a: Affiliate, status: string) { void act(a.id, () => adminApi.setAffiliateStatus(a.id, status)); }
  function payout(a: Affiliate) {
    if (a.balanceCents <= 0) { alert('No balance to pay out.'); return; }
    const amt = prompt(`Payout amount (KES) for ${a.name} — balance ${KES(a.balanceCents)}:`, String(a.balanceCents / 100));
    if (amt === null) return;
    const reference = prompt('Payment reference (M-Pesa code / bank ref):', '') ?? '';
    void act(a.id, () => adminApi.recordAffiliatePayout(a.id, { amountCents: Math.round(Number(amt) * 100), method: a.payoutMethod ?? undefined, reference }));
  }

  return (
    <div style={{ padding: '1.5rem', color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Affiliates</h1>
          <p style={{ color: C.textMuted, fontSize: '0.85rem', margin: '0.25rem 0 0' }}>External partners earning recurring commission on subscriptions.</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ background: C.input, border: `1px solid ${C.inputBorder}`, color: C.text, borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
          {['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: C.textMuted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: C.textMuted }}>No affiliates{filter !== 'ALL' ? ` with status ${filter}` : ''}.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {rows.map((a) => (
            <div key={a.id} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700 }}>{a.name}</span>
                    <Badge status={a.status} />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: C.purple }}>{a.code}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: C.textSecondary, marginTop: 2 }}>{a.email}{a.phone ? ` · ${a.phone}` : ''}</div>
                  <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: 4 }}>
                    {a.commissionPercent}% · {a._count?.conversions ?? 0} signups · earned {KES(a.totalEarnedCents)}
                    {a.payoutDetails ? ` · payout: ${a.payoutMethod} ${a.payoutDetails}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: C.textMuted }}>Balance owed</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: a.balanceCents > 0 ? C.green : C.textMuted }}>{KES(a.balanceCents)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {a.status === 'PENDING' && <Btn color={C.green} onClick={() => approve(a)} disabled={busy === a.id}>Approve</Btn>}
                {a.status === 'PENDING' && <Btn color={C.red} onClick={() => setStatus(a, 'REJECTED')} disabled={busy === a.id}>Reject</Btn>}
                {a.status === 'ACTIVE' && <Btn color={C.amber} onClick={() => setStatus(a, 'SUSPENDED')} disabled={busy === a.id}>Suspend</Btn>}
                {a.status === 'SUSPENDED' && <Btn color={C.green} onClick={() => setStatus(a, 'ACTIVE')} disabled={busy === a.id}>Reactivate</Btn>}
                {a.balanceCents > 0 && <Btn color={C.blue} onClick={() => payout(a)} disabled={busy === a.id}>Record payout</Btn>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ color, onClick, disabled, children }: { color: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 8, padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}
