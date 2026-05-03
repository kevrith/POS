import { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:             '#030712',
  surface:        '#0a0f1e',
  card:           '#0f172a',
  cardBorder:     '#1e293b',
  cardBorder2:    '#263347',
  text:           '#f1f5f9',
  textMuted:      '#64748b',
  textSecondary:  '#94a3b8',
  blue:           '#3b82f6',
  blue2:          '#60a5fa',
  green:          '#10b981',
  amber:          '#f59e0b',
  red:            '#ef4444',
  purple:         '#8b5cf6',
  cyan:           '#06b6d4',
  indigo:         '#6366f1',
};

// ── SVG icon helper ───────────────────────────────────────────────────────────
function Icon({ d, size = 16, color, fill }: { d: string; size?: number; color?: string; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ?? 'none'}
      stroke={color ?? 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const Icons = {
  trending:    'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  revenue:     'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  buildings:   'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  users:       'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  check:       'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  clock:       'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z M12 6v6l4 2',
  alert:       'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  link:        'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  cart:        'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  rocket:      'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0 M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  activity:    'M22 12h-4l-3 9L9 3l-3 9H2',
  award:       'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12',
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
interface KPICardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  sub?: string;
  subColor?: string;
  note?: string;
}

function KPICard({ label, value, icon, color, sub, subColor, note }: KPICardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.card,
        border: `1px solid ${hovered ? C.cardBorder2 : C.cardBorder}`,
        borderRadius: '14px',
        padding: '1.25rem 1.375rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.35)' : 'none',
        transition: 'all 0.18s ease',
        cursor: 'default',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px',
          background: `${color}18`,
          border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          <Icon d={icon} size={16} color={color} />
        </div>
        {sub && (
          <span style={{
            fontSize: '0.6875rem', fontWeight: 700,
            color: subColor ?? C.green,
            background: `${subColor ?? C.green}15`,
            border: `1px solid ${subColor ?? C.green}25`,
            padding: '2px 8px', borderRadius: '20px',
          }}>{sub}</span>
        )}
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: C.text, letterSpacing: '-0.025em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8125rem', color: C.textMuted, fontWeight: 500 }}>{label}</span>
      </div>
      {note && (
        <div style={{ fontSize: '0.6875rem', color: C.textMuted, borderTop: `1px solid ${C.cardBorder}`, paddingTop: '0.5rem', marginTop: '-0.125rem' }}>
          {note}
        </div>
      )}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
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
      background: c.bg, color: c.color, letterSpacing: '0.03em',
    }}>{status}</span>
  );
}

// ── Plan badge ────────────────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string }) {
  const m: Record<string, { bg: string; color: string }> = {
    ENTERPRISE: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
    PRO:        { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    STARTER:    { bg: 'rgba(100,116,139,0.1)',  color: '#94a3b8' },
  };
  const c = m[plan] ?? m.STARTER;
  return (
    <span style={{
      padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700,
      background: c.bg, color: c.color,
    }}>{plan ?? 'STARTER'}</span>
  );
}

// ── Health indicator ──────────────────────────────────────────────────────────
function HealthRow({ label, value, ok, icon }: { label: string; value: string | number; ok: boolean; icon: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.75rem 1rem', background: C.surface,
      borderRadius: '10px', border: `1px solid ${C.cardBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div style={{ color: ok ? C.green : C.amber, width: 16 }}><Icon d={icon} size={14} color={ok ? C.green : C.amber} /></div>
        <span style={{ fontSize: '0.8125rem', color: C.textSecondary, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: ok ? C.green : C.red,
          boxShadow: `0 0 5px ${ok ? C.green : C.red}`,
        }} />
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: ok ? C.green : C.red }}>{value}</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [stats,    setStats]    = useState<any>(null);
  const [recent,   setRecent]   = useState<any[]>([]);
  const [health,   setHealth]   = useState<any>(null);
  const [collected, setCollected] = useState<any>(null);
  const [trials,   setTrials]   = useState<any[]>([]);
  const [dunning,  setDunning]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState(false);
  const [signupSearch, setSignupSearch] = useState('');
  const [extendingId, setExtendingId]   = useState<string | null>(null);

  const fetchHealth = () => adminApi.getHealth().catch(() => null).then(setHealth);

  useEffect(() => {
    Promise.all([
      adminApi.getStats(),
      adminApi.getRecentSignups(),
      adminApi.getHealth().catch(() => null),
      adminApi.getCollectedRevenue().catch(() => null),
      adminApi.getTrialsExpiringSoon(7).catch(() => []),
      adminApi.getDunningList().catch(() => null),
    ]).then(([s, r, h, c, t, d]) => {
      setStats(s); setRecent(r); setHealth(h); setCollected(c); setTrials(t ?? []); setDunning(d);
    }).catch(console.error).finally(() => setLoading(false));

    // Auto-refresh health panel every 30 seconds
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extendTrial = async (bizId: string) => {
    setExtendingId(bizId);
    try {
      await adminApi.updateSubscription(bizId, { trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString() });
      setTrials(prev => prev.filter(b => b.id !== bizId));
    } catch { /* ignore */ } finally { setExtendingId(null); }
  };

  const handleExport = async () => {
    setExporting(true);
    try { await adminApi.exportRevenueCsv(); }
    catch (e) { alert('Export failed: ' + String(e)); }
    finally { setExporting(false); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '14px',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
        }}>
          <Icon d={Icons.activity} size={22} color="#fff" />
        </div>
        <div style={{ color: C.textMuted, fontSize: '0.875rem', fontWeight: 500 }}>Loading platform data…</div>
      </div>
    );
  }

  const fmt = (cents: number) => `KES ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
  const total = stats?.totalBusinesses ?? 1;
  const activeCount = stats?.activeSubscriptions ?? 0;
  const trialCount = stats?.trialBusinesses ?? 0;
  const expiredCount = stats?.expiredBusinesses ?? 0;
  const conversionRate = trialCount > 0 ? Math.round((activeCount / (activeCount + trialCount)) * 100) : 0;

  const planBreakdown = stats?.planBreakdown ?? {};
  const freeCount    = planBreakdown.FREE       ?? 0;
  const starterCount = planBreakdown.STARTER    ?? 0;
  const growthCount  = planBreakdown.GROWTH     ?? 0;
  const proCount     = planBreakdown.PRO        ?? 0;
  const entCount     = planBreakdown.ENTERPRISE ?? 0;
  const mrrCents     = stats?.estimatedMRRCents ?? 0;
  const starterShare = mrrCents > 0 ? (starterCount *  99900) / mrrCents * 100 : 0;
  const growthShare  = mrrCents > 0 ? (growthCount  * 249900) / mrrCents * 100 : 0;
  const proShare     = mrrCents > 0 ? (proCount     * 499900) / mrrCents * 100 : 0;
  const entShare     = mrrCents > 0 ? (entCount     * 1499900) / mrrCents * 100 : 0;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Section label ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
            Platform Overview
          </div>
          <div style={{ fontSize: '0.8125rem', color: C.textMuted }}>
            MRR & ARR are calculated from <strong style={{ color: C.green }}>active subscriptions only</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={handleExport} disabled={exporting} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0.375rem 0.875rem', borderRadius: 20, border: `1px solid ${C.green}40`,
            background: 'rgba(16,185,129,0.08)', color: C.green, cursor: exporting ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem', fontWeight: 700, opacity: exporting ? 0.6 : 1,
          }}>
            <Icon d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3' size={12} color={C.green} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <div style={{
            padding: '0.375rem 0.875rem',
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '20px', fontSize: '0.75rem', color: C.green, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.green, boxShadow: `0 0 5px ${C.green}` }} />
            LIVE
          </div>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem' }}>
        <KPICard label="Monthly Recurring Revenue" value={fmt(mrrCents)}
          icon={Icons.revenue} color={C.green} sub="Active only" note="Based on active subscription mix" />
        <KPICard label="Annual Recurring Revenue"  value={fmt(stats?.estimatedARRCents ?? 0)}
          icon={Icons.trending} color={C.cyan} note="Projection — not yet received" />
        <KPICard
          label="Revenue Collected (KES)"
          value={collected?.available ? fmt(collected.totalCents) : fmt(mrrCents)}
          icon={Icons.award} color={C.green}
          sub={collected?.available ? 'Paystack live' : 'Calculated'}
          note={collected?.available ? 'Confirmed Paystack transactions' : 'Set PAYSTACK_SECRET_KEY for live data'}
        />
        <KPICard label="Gross Merchandise Value (30d)" value={fmt(stats?.gmv30dCents ?? 0)}
          icon={Icons.cart} color={C.blue} />
        <KPICard label="Total Platform GMV"        value={fmt(stats?.totalGMVCents ?? 0)}
          icon={Icons.award} color={C.purple} />
        <KPICard label="New Sign-ups (30d)"         value={stats?.newBusinesses30d ?? 0}
          icon={Icons.rocket} color={C.amber} sub={`+${stats?.newBusinesses30d ?? 0}`} subColor={C.amber} />
        <KPICard label="Referrals Converted"        value={stats?.referralsConverted ?? 0}
          icon={Icons.link} color={C.indigo} />
      </div>

      {/* ── Business health KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
        <KPICard label="Total Businesses"  value={total}             icon={Icons.buildings} color={C.blue} />
        <KPICard label="Active Plans"      value={activeCount}       icon={Icons.check}     color={C.green} />
        <KPICard label="On Trial"          value={trialCount}        icon={Icons.clock}     color={C.amber} />
        <KPICard label="Expired / Lapsed"  value={expiredCount}      icon={Icons.alert}     color={C.red} />
        <KPICard label="Total Users"       value={stats?.totalUsers ?? 0} icon={Icons.users} color={C.purple} />
        <KPICard label="Trial → Active %"  value={`${conversionRate}%`}
          icon={Icons.trending} color={conversionRate >= 50 ? C.green : C.amber}
          note="Conversion of trial businesses" />
      </div>

      {/* ── Revenue attribution + Health ── */}
      <div style={{ display: 'grid', gridTemplateColumns: health ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>

        {/* Revenue attribution */}
        <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Revenue Attribution</div>
              <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '2px' }}>MRR breakdown by plan tier</div>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: C.green }}>{fmt(mrrCents)}</div>
          </div>

          {/* Stacked bar */}
          <div style={{ height: '10px', borderRadius: '5px', overflow: 'hidden', display: 'flex', marginBottom: '1.25rem', background: C.surface }}>
            <div style={{ width: `${starterShare}%`, background: C.textMuted,  transition: 'width 0.6s ease' }} />
            <div style={{ width: `${growthShare}%`,  background: C.cyan,       transition: 'width 0.6s ease' }} />
            <div style={{ width: `${proShare}%`,     background: C.blue,       transition: 'width 0.6s ease' }} />
            <div style={{ width: `${entShare}%`,     background: C.purple,     transition: 'width 0.6s ease' }} />
          </div>

          {/* Legend rows */}
          {[
            { label: 'Enterprise', count: entCount,    price: 1499900, color: C.purple },
            { label: 'Pro',        count: proCount,    price: 499900,  color: C.blue },
            { label: 'Growth',     count: growthCount, price: 249900,  color: C.cyan },
            { label: 'Starter',    count: starterCount, price: 99900,  color: C.textMuted },
            { label: 'Free',       count: freeCount,   price: 0,       color: C.green },
          ].map(p => {
            const contribution = (p.count * p.price / 100);
            const pct = mrrCents > 0 ? Math.round(p.count * p.price / mrrCents * 100) : 0;
            return (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: `1px solid ${C.cardBorder}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: p.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8125rem', color: C.textSecondary, fontWeight: 500 }}>{p.label}</span>
                  <span style={{ fontSize: '0.75rem', color: C.textMuted }}>({p.count} biz)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: C.textMuted }}>
                    KES {contribution.toLocaleString('en-KE', { maximumFractionDigits: 0 })} / mo
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: p.color,
                    background: `${p.color}15`, padding: '1px 8px', borderRadius: '10px' }}>
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* System Health */}
        {health && (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>System Health</div>
                <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '2px' }}>Real-time platform status</div>
              </div>
              {(() => {
                const emailQ   = health.queueDepths?.email    ?? 0;
                const webhookQ = health.queueDepths?.webhooks ?? 0;
                const etimsQ   = health.queueDepths?.etims    ?? 0;
                const failRate = health.etimsFailureRate      ?? 0;
                const isIncident  = failRate > 20 || emailQ > 50 || webhookQ > 50 || etimsQ > 50;
                const isDegraded  = !isIncident && (failRate > 0 || emailQ > 10 || webhookQ > 10 || etimsQ > 10);
                const label  = isIncident ? 'INCIDENT'    : isDegraded ? 'DEGRADED'    : 'OPERATIONAL';
                const color  = isIncident ? C.red         : isDegraded ? C.amber       : C.green;
                const bgRgba = isIncident ? '239,68,68'   : isDegraded ? '245,158,11'  : '16,185,129';
                return (
                  <span style={{
                    fontSize: '0.6875rem', color, fontWeight: 700,
                    background: `rgba(${bgRgba},0.1)`, border: `1px solid rgba(${bgRgba},0.25)`,
                    padding: '2px 10px', borderRadius: '20px',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 5px ${color}` }} />
                    {label}
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <HealthRow label="Active Businesses" value={health.activeBusinesses ?? '—'} ok={true}      icon={Icons.buildings} />
              <HealthRow label="Sales (24h)"        value={health.sales24h ?? '—'}         ok={true}      icon={Icons.activity} />
              <HealthRow label="eTIMS Failures"     value={`${health.etimsFailureRate ?? 0}%`} ok={!(health.etimsFailureRate)} icon={Icons.alert} />
              <HealthRow label="Email Queue"        value={health.queueDepths?.email ?? 0}    ok={(health.queueDepths?.email ?? 0) === 0}    icon={Icons.activity} />
              <HealthRow label="Webhook Queue"      value={health.queueDepths?.webhooks ?? 0} ok={(health.queueDepths?.webhooks ?? 0) === 0} icon={Icons.link} />
              <HealthRow label="eTIMS Queue"        value={health.queueDepths?.etims ?? 0}    ok={(health.queueDepths?.etims ?? 0) === 0}    icon={Icons.check} />
              <HealthRow
                label="Last DB Backup"
                value={health.lastBackupAt ? new Date(health.lastBackupAt).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                ok={!!health.lastBackupAt && (Date.now() - new Date(health.lastBackupAt).getTime()) < 26 * 3600000}
                icon={Icons.award}
              />
            </div>
            <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginTop: '0.75rem', textAlign: 'right' }}>
              Auto-refreshes every 30s · Last updated {new Date(health.timestamp).toLocaleTimeString('en-KE')}
            </div>
          </div>
        )}

        {/* If no health, show conversion funnel */}
        {!health && (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1.5rem' }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '1rem' }}>Subscription Funnel</div>
            {[
              { label: 'Total Businesses', value: total,        color: C.blue },
              { label: 'On Trial',         value: trialCount,   color: C.amber },
              { label: 'Active Paid',      value: activeCount,  color: C.green },
              { label: 'Expired / Lost',   value: expiredCount, color: C.red },
            ].map(r => {
              const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
              return (
                <div key={r.label} style={{ marginBottom: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.8125rem', color: C.textSecondary, fontWeight: 500 }}>{r.label}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: r.color }}>{r.value} ({pct}%)</span>
                  </div>
                  <div style={{ height: '6px', background: C.surface, borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: r.color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Trials Expiring Soon ── */}
      {trials.length > 0 && (
        <div style={{ background: C.card, border: `1px solid rgba(245,158,11,0.3)`, borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Icon d={Icons.clock} size={16} color={C.amber} />
              <div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Trials Expiring Within 7 Days</div>
                <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '1px' }}>Intervention window — extend or convert</div>
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.amber, background: 'rgba(245,158,11,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.25)' }}>
              {trials.length} accounts
            </span>
          </div>
          <div>
            {trials.map((b: any, i: number) => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                padding: '0.875rem 1.5rem', borderBottom: i < trials.length - 1 ? `1px solid ${C.cardBorder}` : 'none',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  <div style={{ fontSize: '0.75rem', color: C.textMuted }}>{b.users?.[0]?.email ?? 'no owner email'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '0.8125rem', fontWeight: 700,
                    color: b.daysRemaining <= 1 ? C.red : b.daysRemaining <= 3 ? C.amber : C.textSecondary,
                  }}>
                    {b.daysRemaining === 0 ? 'Expires today' : `${b.daysRemaining}d left`}
                  </span>
                  <button
                    onClick={() => extendTrial(b.id)}
                    disabled={extendingId === b.id}
                    style={{
                      padding: '5px 14px', borderRadius: '8px', border: `1px solid ${C.amber}`,
                      background: 'rgba(245,158,11,0.1)', color: C.amber,
                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', opacity: extendingId === b.id ? 0.5 : 1,
                    }}
                  >
                    {extendingId === b.id ? '…' : '+7 days'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dunning / Expired Accounts ── */}
      {dunning && dunning.totalAtRisk > 0 && (
        <div style={{ background: C.card, border: `1px solid rgba(239,68,68,0.25)`, borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Icon d={Icons.alert} size={16} color={C.red} />
              <div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Dunning — Lapsed Accounts</div>
                <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '1px' }}>Expired and overdue trials needing follow-up</div>
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.red, background: 'rgba(239,68,68,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(239,68,68,0.2)' }}>
              {dunning.totalAtRisk} at risk
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

            {/* Recently expired */}
            <div style={{ borderRight: `1px solid ${C.cardBorder}` }}>
              <div style={{ padding: '0.625rem 1.25rem', background: C.surface, fontSize: '0.6875rem', color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Recently Expired ({dunning.recentlyExpired.length})
              </div>
              {dunning.recentlyExpired.slice(0, 5).map((b: any) => (
                <div key={b.id} style={{ padding: '0.75rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}` }}>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: '0.8125rem' }}>{b.name}</div>
                  <div style={{ fontSize: '0.75rem', color: C.textMuted }}>{b.users?.[0]?.email ?? '—'}</div>
                  <div style={{ fontSize: '0.6875rem', color: C.red, marginTop: 2 }}>
                    Expired {new Date(b.updatedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>

            {/* Overdue trials */}
            <div>
              <div style={{ padding: '0.625rem 1.25rem', background: C.surface, fontSize: '0.6875rem', color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Overdue Trials ({dunning.expiredTrials.length})
              </div>
              {dunning.expiredTrials.slice(0, 5).map((b: any) => (
                <div key={b.id} style={{ padding: '0.75rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}` }}>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: '0.8125rem' }}>{b.name}</div>
                  <div style={{ fontSize: '0.75rem', color: C.textMuted }}>{b.users?.[0]?.email ?? '—'}</div>
                  <div style={{ fontSize: '0.6875rem', color: C.amber, marginTop: 2 }}>
                    Trial ended {b.trialEndsAt ? new Date(b.trialEndsAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Sign-ups ── */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{
          padding: '1.125rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Recent Sign-ups</div>
            <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '1px' }}>New businesses registered in the last 30 days</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              value={signupSearch}
              onChange={e => setSignupSearch(e.target.value)}
              placeholder="Search name or email…"
              style={{
                padding: '5px 12px', borderRadius: '8px', border: `1px solid ${C.cardBorder}`,
                background: C.surface, color: C.text, fontSize: '0.8125rem', outline: 'none', width: '200px',
              }}
            />
            <span style={{ fontSize: '0.75rem', color: C.textMuted, background: C.surface, padding: '4px 12px', borderRadius: '20px', border: `1px solid ${C.cardBorder}`, whiteSpace: 'nowrap' }}>
              {recent.filter(b => !signupSearch || b.name?.toLowerCase().includes(signupSearch.toLowerCase()) || b.users?.[0]?.email?.toLowerCase().includes(signupSearch.toLowerCase())).length} shown
            </span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {['Business', 'Owner', 'Status', 'Plan', 'Stores', 'Users', 'Joined'].map(h => (
                  <th key={h} style={{
                    padding: '0.75rem 1.25rem', textAlign: 'left',
                    fontSize: '0.6875rem', color: C.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
                    whiteSpace: 'nowrap',
                    borderBottom: `1px solid ${C.cardBorder}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent
                .filter(b => !signupSearch || b.name?.toLowerCase().includes(signupSearch.toLowerCase()) || b.users?.[0]?.email?.toLowerCase().includes(signupSearch.toLowerCase()))
                .slice(0, 15).map((b: any, i: number) => (
                <tr key={b.id}
                  style={{
                    borderBottom: i < Math.min(recent.length, 15) - 1 ? `1px solid ${C.cardBorder}` : 'none',
                    transition: 'background 0.12s',
                    cursor: 'default',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(59,130,246,0.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ fontWeight: 600, color: C.text, fontSize: '0.875rem' }}>{b.name}</div>
                    <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '1px' }}>{b.id.slice(0, 12)}…</div>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ fontSize: '0.8125rem', color: C.textSecondary }}>{b.users?.[0]?.email ?? '—'}</div>
                    {b.users?.[0]?.name && <div style={{ fontSize: '0.75rem', color: C.textMuted }}>{b.users[0].name}</div>}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}><StatusBadge status={b.subscriptionStatus} /></td>
                  <td style={{ padding: '0.875rem 1.25rem' }}><PlanBadge plan={b.subscriptionTier ?? b.planName ?? 'STARTER'} /></td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textSecondary, fontSize: '0.8125rem', textAlign: 'center' }}>
                    {b._count?.stores ?? '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textSecondary, fontSize: '0.8125rem', textAlign: 'center' }}>
                    {b._count?.users ?? '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                    {new Date(b.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
              <div style={{ color: C.cardBorder2, marginBottom: '0.75rem' }}>
                <Icon d={Icons.buildings} size={32} color={C.cardBorder2} />
              </div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: C.textSecondary }}>No recent sign-ups</div>
              <div style={{ fontSize: '0.8125rem', color: C.textMuted, marginTop: '4px' }}>New businesses will appear here</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
