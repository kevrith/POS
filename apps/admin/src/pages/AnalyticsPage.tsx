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
  churn:    'M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5',
  cohort:   'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  ltv:      'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  paystack: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  export:   'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  trend:    'M23 6l-9.5 9.5-5-5L1 18',
  alert:    'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
};

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

type Tab = 'churn' | 'cohort' | 'ltv' | 'paystack';

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBar({ value, max, color, height = 60 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ width: 24, height, background: C.surface, borderRadius: 4, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: `${pct}%`, background: color, borderRadius: 4, transition: 'height 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── Churn Tab ─────────────────────────────────────────────────────────────────
function ChurnTab() {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom]       = useState('');
  const [to,   setTo]         = useState('');

  const load = (f?: string, t?: string) => {
    setLoading(true);
    adminApi.getChurnAnalytics(f || undefined, t || undefined)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ color: C.textMuted, padding: '2rem', textAlign: 'center' }}>Loading churn data…</div>;
  if (!data)   return <div style={{ color: C.red, padding: '2rem' }}>Failed to load churn data.</div>;

  const maxCancelled = Math.max(1, ...data.trend.map((t: any) => t.cancelled));
  const REASON_LABELS: Record<string, string> = {
    PRICE: 'Too Expensive', COMPETITOR: 'Chose Competitor',
    MISSING_FEATURE: 'Missing Feature', POOR_SUPPORT: 'Poor Support', OTHER: 'Other',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Date-range picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8125rem', color: C.textMuted, fontWeight: 500 }}>Range:</span>
        <input type="date" aria-label="From date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.text, fontSize: '0.8125rem', outline: 'none' }} />
        <span style={{ color: C.textMuted, fontSize: '0.8125rem' }}>→</span>
        <input type="date" aria-label="To date" value={to} onChange={e => setTo(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.text, fontSize: '0.8125rem', outline: 'none' }} />
        <button onClick={() => load(from || undefined, to || undefined)}
          style={{ padding: '5px 16px', borderRadius: 8, background: C.blue, color: '#fff', border: 'none', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
          Apply
        </button>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); load(); }}
            style={{ padding: '5px 12px', borderRadius: 8, background: 'transparent', color: C.textMuted, border: `1px solid ${C.cardBorder}`, fontSize: '0.8125rem', cursor: 'pointer' }}>
            Reset
          </button>
        )}
        {data.from && data.to && (
          <span style={{ fontSize: '0.75rem', color: C.textMuted }}>
            Showing {data.from} → {data.to} ({data.trend.length} months)
          </span>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: '1rem' }}>
        {[
          { label: 'Monthly Churn Rate', value: `${data.churnRate30d}%`, color: data.churnRate30d > 5 ? C.red : C.green, note: 'Last 30 days' },
          { label: 'Cancelled (30d)',    value: data.cancelled30d,        color: C.amber,  note: 'Subscriptions lost' },
          { label: 'At-Risk Accounts',   value: data.atRisk,             color: C.amber,  note: 'Starter ≥ 3 months' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: '0.8125rem', color: C.textMuted, marginTop: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginTop: 2 }}>{kpi.note}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '1.5rem' }}>
        <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '1.25rem' }}>
          12-Month Cancellation Trend
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
          {data.trend.map((t: any) => (
            <div key={t.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 44 }}>
              <span style={{ fontSize: '0.6875rem', color: t.cancelled > 0 ? C.red : C.textMuted, fontWeight: 700 }}>
                {t.cancelled > 0 ? t.cancelled : ''}
              </span>
              <MiniBar value={t.cancelled} max={maxCancelled} color={t.cancelled > 0 ? C.red : C.cardBorder2} height={80} />
              <span style={{ fontSize: '0.5625rem', color: C.textMuted, whiteSpace: 'nowrap' }}>
                {t.month.slice(5)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {data.trend.map((t: any) => (
            <div key={t.month} style={{ fontSize: '0.6875rem', color: C.textMuted }}>
              <span style={{ color: C.textSecondary, fontWeight: 600 }}>{t.month}: </span>
              {t.cancelled} cancelled · {t.churnRate}% churn
            </div>
          ))}
        </div>
      </div>

      {/* Cancellation reasons */}
      {data.reasons.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '1.5rem' }}>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '1.25rem' }}>
            Cancellation Reasons
          </div>
          {data.reasons.map((r: any) => {
            const total = data.reasons.reduce((s: number, x: any) => s + x.count, 0);
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return (
              <div key={r.reason} style={{ marginBottom: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.8125rem', color: C.textSecondary }}>{REASON_LABELS[r.reason] ?? r.reason}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: C.red }}>{r.count} ({pct}%)</span>
                </div>
                <div style={{ height: 6, background: C.surface, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: C.red, borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
          {data.reasons.length === 0 && (
            <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>No cancellation reasons recorded yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Cohort Tab ────────────────────────────────────────────────────────────────
function CohortTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getCohortAnalysis().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.textMuted, padding: '2rem', textAlign: 'center' }}>Loading cohort data…</div>;
  if (!data)   return <div style={{ color: C.red, padding: '2rem' }}>Failed to load cohort data.</div>;

  const cohorts: any[] = data.cohorts ?? [];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}` }}>
        <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Signup Cohort Analysis</div>
        <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: 2 }}>
          Which month's signups convert best to paid plans
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.surface }}>
              {['Month', 'Total', 'Active', 'Trial', 'Cancelled', 'Expired', 'Conversion %', 'Churn %'].map(h => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.cardBorder}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c: any, i: number) => (
              <tr key={c.month} style={{ borderBottom: i < cohorts.length - 1 ? `1px solid ${C.cardBorder}` : 'none' }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = `${C.blue}0a`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: C.text, fontSize: '0.875rem' }}>{c.month}</td>
                <td style={{ padding: '0.875rem 1rem', color: C.textSecondary, fontSize: '0.875rem' }}>{c.total}</td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <span style={{ color: C.green, fontWeight: 700, fontSize: '0.875rem' }}>{c.active}</span>
                </td>
                <td style={{ padding: '0.875rem 1rem', color: C.amber, fontSize: '0.875rem' }}>{c.trial}</td>
                <td style={{ padding: '0.875rem 1rem', color: C.red, fontSize: '0.875rem' }}>{c.cancelled}</td>
                <td style={{ padding: '0.875rem 1rem', color: C.textMuted, fontSize: '0.875rem' }}>{c.expired}</td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: C.surface, borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                      <div style={{ height: '100%', width: `${c.conversionRate}%`, background: c.conversionRate >= 50 ? C.green : C.amber, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: c.conversionRate >= 50 ? C.green : C.amber, minWidth: 36 }}>
                      {c.conversionRate}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: c.churnRate > 20 ? C.red : C.textMuted }}>
                    {c.churnRate}%
                  </span>
                </td>
              </tr>
            ))}
            {cohorts.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>No cohort data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── LTV Tab ───────────────────────────────────────────────────────────────────
function LTVTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'ltv' | 'gmv' | 'name'>('ltv');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    adminApi.getBusinessLTV(page, sortBy).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [page, sortBy]);

  const businesses: any[] = data?.businesses ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.8125rem', color: C.textMuted }}>Sort by:</span>
        {(['ltv', 'gmv', 'name'] as const).map(s => (
          <button key={s} onClick={() => { setSortBy(s); setPage(1); }} style={{
            padding: '4px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
            background: sortBy === s ? C.blue : C.surface,
            color: sortBy === s ? '#fff' : C.textMuted,
            border: `1px solid ${sortBy === s ? C.blue : C.cardBorder}`,
          }}>{s.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
        {loading && <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>Loading…</div>}
        {!loading && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {['Business', 'Plan', 'Status', 'Months Active', 'Monthly Price', 'Est. LTV', 'Total GMV'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.cardBorder}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {businesses.map((biz: any, i: number) => {
                  const planColor = biz.subscriptionTier === 'ENTERPRISE' ? C.purple : biz.subscriptionTier === 'PRO' ? C.blue : C.textMuted;
                  return (
                    <tr key={biz.id} style={{ borderBottom: i < businesses.length - 1 ? `1px solid ${C.cardBorder}` : 'none' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = `${C.blue}0a`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: C.text, fontSize: '0.875rem' }}>{biz.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: C.textMuted }}>{biz.id.slice(0,12)}…</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: planColor, background: `${planColor}18`, padding: '2px 8px', borderRadius: 10 }}>
                          {biz.subscriptionTier}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: biz.subscriptionStatus === 'ACTIVE' ? C.green : biz.subscriptionStatus === 'CANCELLED' ? C.red : C.amber }}>
                        {biz.subscriptionStatus}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: C.textSecondary, fontSize: '0.875rem', textAlign: 'center' }}>{biz.monthsActive}</td>
                      <td style={{ padding: '0.875rem 1rem', color: C.textSecondary, fontSize: '0.875rem' }}>
                        {fmt(biz.ltvCents / Math.max(1, biz.monthsActive))}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{ fontWeight: 700, color: C.green, fontSize: '0.875rem' }}>{fmt(biz.ltvCents)}</span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: C.accentText, fontSize: '0.875rem', fontWeight: 600 }}>
                        {fmt(biz.totalGMVCents)}
                      </td>
                    </tr>
                  );
                })}
                {businesses.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>No businesses yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
            Prev
          </button>
          <span style={{ padding: '6px 12px', color: C.textMuted, fontSize: '0.8125rem' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.surface, color: C.textSecondary, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ── Paystack Tab ──────────────────────────────────────────────────────────────
function PaystackTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getPaystackRevenue().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.textMuted, padding: '2rem', textAlign: 'center' }}>Fetching Paystack data…</div>;

  if (!data?.available) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
        <Icon d={Icons.alert} size={32} color={C.amber} />
        <div style={{ fontSize: '1rem', fontWeight: 700, color: C.text, marginTop: '1rem' }}>Paystack Not Connected</div>
        <div style={{ fontSize: '0.875rem', color: C.textMuted, marginTop: '0.5rem' }}>{data?.message}</div>
        <div style={{ fontSize: '0.8125rem', color: C.textMuted, marginTop: '0.75rem' }}>
          Set <code style={{ background: C.surface, padding: '2px 6px', borderRadius: 4 }}>PAYSTACK_SECRET_KEY</code> in your API environment to enable real revenue tracking.
        </div>
      </div>
    );
  }

  const maxAmount = Math.max(1, ...data.monthlyBreakdown.map((m: any) => m.amountCents));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Collected (KES)',  value: fmt(data.totalCollectedCents),  color: C.green },
          { label: 'Total Transactions',     value: data.totalTransactions,         color: C.blue },
          { label: 'Active Subscriptions',   value: data.activeSubscriptions,       color: C.accentText },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ fontSize: '1.625rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: '0.8125rem', color: C.textMuted, marginTop: 4 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {data.monthlyBreakdown.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '1.5rem' }}>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '1.25rem' }}>
            Monthly Revenue — Paystack (KES)
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            {data.monthlyBreakdown.map((m: any) => (
              <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                <span style={{ fontSize: '0.5625rem', color: C.green, fontWeight: 700 }}>
                  {m.amountCents > 0 ? `KES ${Math.round(m.amountCents / 100).toLocaleString()}` : ''}
                </span>
                <MiniBar value={m.amountCents} max={maxAmount} color={C.green} height={80} />
                <span style={{ fontSize: '0.5625rem', color: C.textMuted }}>{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.rawSubscriptions?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>
            Active Subscriptions (Paystack)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {['Customer', 'Plan', 'Status', 'Amount', 'Next Charge'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${C.cardBorder}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rawSubscriptions.map((sub: any, i: number) => (
                  <tr key={sub.id ?? i} style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
                    <td style={{ padding: '0.75rem 1rem', color: C.textSecondary, fontSize: '0.8125rem' }}>{sub.customer?.email ?? '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: C.textSecondary, fontSize: '0.8125rem' }}>{sub.plan?.name ?? '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: sub.status === 'active' ? C.green : C.amber }}>
                        {sub.status?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: C.green, fontWeight: 600, fontSize: '0.8125rem' }}>
                      KES {((sub.amount ?? 0) / 100).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: C.textMuted, fontSize: '0.8125rem' }}>
                      {sub.next_payment_date ? new Date(sub.next_payment_date).toLocaleDateString('en-KE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('churn');
  const [exporting, setExporting] = useState(false);

  const TABS: { id: Tab; label: string; icon: string; color: string }[] = [
    { id: 'churn',    label: 'Churn',          icon: Icons.churn,    color: C.red },
    { id: 'cohort',   label: 'Cohort',         icon: Icons.cohort,   color: C.blue },
    { id: 'ltv',      label: 'LTV',            icon: Icons.ltv,      color: C.green },
    { id: 'paystack', label: 'Paystack',        icon: Icons.paystack, color: C.accentText },
  ];

  const handleExport = async () => {
    setExporting(true);
    try { await adminApi.exportRevenueCsv(); }
    catch (e) { alert('Export failed: ' + String(e)); }
    finally { setExporting(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
            Advanced Analytics
          </div>
          <div style={{ fontSize: '0.8125rem', color: C.textMuted }}>Churn, cohorts, LTV, and real revenue</div>
        </div>
        <button onClick={handleExport} disabled={exporting} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0.5rem 1rem', borderRadius: 8, cursor: exporting ? 'not-allowed' : 'pointer',
          background: C.green, color: '#fff', border: 'none', fontSize: '0.8125rem', fontWeight: 600,
          opacity: exporting ? 0.6 : 1,
        }}>
          <Icon d={Icons.export} size={14} color="#fff" />
          {exporting ? 'Exporting…' : 'Export Revenue CSV'}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, background: C.surface, padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tab === t.id ? C.card : 'transparent',
            color: tab === t.id ? t.color : C.textMuted,
            fontSize: '0.8125rem', fontWeight: tab === t.id ? 600 : 400,
            transition: 'all 0.15s',
            boxShadow: tab === t.id ? `0 1px 4px ${C.overlay}33` : 'none',
          }}>
            <Icon d={t.icon} size={13} color={tab === t.id ? t.color : C.textMuted} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'churn'    && <ChurnTab />}
      {tab === 'cohort'   && <CohortTab />}
      {tab === 'ltv'      && <LTVTab />}
      {tab === 'paystack' && <PaystackTab />}
    </div>
  );
}
