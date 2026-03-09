import { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

const C = {
  card: '#111827',
  cardBorder: '#1e293b',
  text: '#f1f5f9',
  textMuted: '#64748b',
  textSecondary: '#94a3b8',
  blue: '#3b82f6',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  bg: string;
  sub?: string;
}

function StatCard({ label, value, icon, color, bg, sub }: StatCardProps) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.cardBorder}`,
      borderRadius: '14px',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.125rem', flexShrink: 0,
        }}>
          {icon}
        </div>
        {sub && (
          <span style={{ fontSize: '0.6875rem', color: C.green, fontWeight: 600, background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '20px' }}>
            {sub}
          </span>
        )}
      </div>
      <div style={{ fontSize: '1.875rem', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.8125rem', color: C.textMuted, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function HealthItem({ label, value, ok, icon }: { label: string; value: string | number; ok: boolean; icon: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.875rem 1rem',
      background: '#0a0f1e',
      borderRadius: '10px',
      border: `1px solid ${C.cardBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <span style={{ fontSize: '1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.8125rem', color: C.textSecondary, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: ok ? C.green : C.red,
          boxShadow: ok ? `0 0 6px ${C.green}` : `0 0 6px ${C.red}`,
        }} />
        <span style={{ fontSize: '0.875rem', color: ok ? C.green : C.red, fontWeight: 600 }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    ACTIVE:    { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    TRIAL:     { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    EXPIRED:   { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
    CANCELLED: { bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
  };
  const c = colors[status] ?? colors.CANCELLED;
  return (
    <span style={{
      padding: '2px 10px', borderRadius: '20px', fontSize: '0.6875rem', fontWeight: 700,
      background: c.bg, color: c.color, letterSpacing: '0.02em',
    }}>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getStats(), adminApi.getRecentSignups(), adminApi.getHealth().catch(() => null)])
      .then(([s, r, h]) => { setStats(s); setRecent(r); setHealth(h); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⚙️</div>
        <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>Loading platform data…</div>
      </div>
    );
  }

  const formatKES = (cents: number) => `KES ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  return (
    <div className="fade-in">
      {/* Primary KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <StatCard label="Est. MRR"          value={formatKES(stats?.estimatedMRRCents ?? 0)} icon="📈" color={C.green}  bg="rgba(16,185,129,0.12)" sub="Monthly" />
        <StatCard label="Est. ARR"          value={formatKES(stats?.estimatedARRCents ?? 0)} icon="💹" color={C.cyan}   bg="rgba(6,182,212,0.12)" />
        <StatCard label="GMV (30d)"         value={formatKES(stats?.gmv30dCents ?? 0)}       icon="💰" color={C.blue}   bg="rgba(59,130,246,0.12)" />
        <StatCard label="New Signups (30d)" value={stats?.newBusinesses30d ?? 0}            icon="✨" color={C.amber}  bg="rgba(245,158,11,0.12)" />
        <StatCard label="Referrals Converted" value={stats?.referralsConverted ?? 0}        icon="🔗" color="#06b6d4"  bg="rgba(6,182,212,0.12)" />
        <StatCard label="Total GMV"         value={formatKES(stats?.totalGMVCents ?? 0)}    icon="🏆" color={C.purple} bg="rgba(139,92,246,0.12)" />
      </div>

      {/* Secondary stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard label="Total Businesses" value={stats?.totalBusinesses ?? 0}   icon="🏢" color={C.blue}   bg="rgba(59,130,246,0.12)" />
        <StatCard label="Active Plans"     value={stats?.activeSubscriptions ?? 0} icon="✅" color={C.green}  bg="rgba(16,185,129,0.12)" />
        <StatCard label="On Trial"         value={stats?.trialBusinesses ?? 0}   icon="⏳" color={C.amber}  bg="rgba(245,158,11,0.12)" />
        <StatCard label="Expired"          value={stats?.expiredBusinesses ?? 0} icon="❌" color={C.red}    bg="rgba(239,68,68,0.12)" />
        <StatCard label="Total Users"      value={stats?.totalUsers ?? 0}        icon="👥" color={C.purple} bg="rgba(139,92,246,0.12)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: health ? '1fr 1fr' : '1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* System Health */}
        {health && (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>System Health</h3>
              <span style={{ fontSize: '0.6875rem', color: C.green, background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>
                LIVE
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <HealthItem label="Active Businesses" value={health.activeBusinesses ?? '—'} ok={true} icon="🏢" />
              <HealthItem label="Sales (24h)"       value={health.sales24h ?? '—'} ok={true} icon="📊" />
              <HealthItem label="eTIMS Failures"    value={health.etimsFailureRate ?? 0} ok={!health.etimsFailureRate} icon="🏛️" />
              <HealthItem label="Email Queue"       value={health.queueDepths?.email ?? 0} ok={(health.queueDepths?.email ?? 0) === 0} icon="📧" />
              <HealthItem label="Webhook Queue"     value={health.queueDepths?.webhooks ?? 0} ok={(health.queueDepths?.webhooks ?? 0) === 0} icon="🔗" />
              <HealthItem label="eTIMS Queue"       value={health.queueDepths?.etims ?? 0} ok={(health.queueDepths?.etims ?? 0) === 0} icon="⚡" />
            </div>
          </div>
        )}

        {/* Quick stats summary */}
        <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '1rem' }}>Platform Summary</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { label: 'Active', value: stats?.activeSubscriptions ?? 0, total: stats?.totalBusinesses ?? 1, color: C.green },
              { label: 'Trial', value: stats?.trialBusinesses ?? 0, total: stats?.totalBusinesses ?? 1, color: C.amber },
              { label: 'Expired', value: stats?.expiredBusinesses ?? 0, total: stats?.totalBusinesses ?? 1, color: C.red },
            ].map(({ label, value, total, color }) => {
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.8125rem', color: C.textSecondary, fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '0.8125rem', color, fontWeight: 700 }}>{value} ({pct}%)</span>
                  </div>
                  <div style={{ height: '6px', background: '#0a0f1e', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent signups */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Recent Sign-ups</h3>
          <span style={{ fontSize: '0.75rem', color: C.textMuted }}>Last 30 days</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0a0f1e' }}>
                {['Business', 'Owner', 'Status', 'Plan', 'Joined'].map(h => (
                  <th key={h} style={{
                    padding: '0.75rem 1.25rem', textAlign: 'left',
                    fontSize: '0.6875rem', color: C.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.slice(0, 15).map((b: any) => (
                <tr key={b.id} style={{ borderTop: `1px solid ${C.cardBorder}`, transition: 'background 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '0.875rem 1.25rem', color: C.text, fontWeight: 600, fontSize: '0.875rem' }}>{b.name}</td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textSecondary, fontSize: '0.8125rem' }}>{b.users?.[0]?.email ?? '—'}</td>
                  <td style={{ padding: '0.875rem 1.25rem' }}><StatusBadge status={b.subscriptionStatus} /></td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem' }}>{b.planName}</td>
                  <td style={{ padding: '0.875rem 1.25rem', color: C.textMuted, fontSize: '0.8125rem' }}>
                    {new Date(b.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: C.textMuted }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
              No recent sign-ups
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
