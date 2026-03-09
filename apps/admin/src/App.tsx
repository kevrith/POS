import { useState } from 'react';
import { getAdminToken, getAdminEmail, clearAdminToken } from './lib/api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BusinessesPage from './pages/BusinessesPage';
import LicenseKeysPage from './pages/LicenseKeysPage';
import SupportPage from './pages/SupportPage';
import ReferralsPage from './pages/ReferralsPage';

type Page = 'dashboard' | 'businesses' | 'license-keys' | 'support' | 'referrals';

const C = {
  bg: '#0a0f1e',
  sidebar: '#0f172a',
  sidebarBorder: '#1e293b',
  card: '#111827',
  cardBorder: '#1e293b',
  text: '#f1f5f9',
  textMuted: '#64748b',
  textSecondary: '#94a3b8',
  accent: '#3b82f6',
  accentDark: '#1d4ed8',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
} as const;

// Simple SVG icon components (no external dep required)
function Icon({ d, size = 16, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// Icon paths
const Icons = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  businesses: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  license: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  support: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
};

// Icon paths
const MoreIcons = {
  referral: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
};

const NAV: Array<{ id: Page; label: string; icon: string; color: string }> = [
  { id: 'dashboard',    label: 'Dashboard',     icon: Icons.dashboard,   color: C.accent },
  { id: 'businesses',  label: 'Businesses',    icon: Icons.businesses,  color: C.purple },
  { id: 'license-keys',label: 'License Keys',  icon: Icons.license,     color: C.success },
  { id: 'referrals',   label: 'Referrals',     icon: MoreIcons.referral, color: '#06b6d4' },
  { id: 'support',     label: 'Support Tools', icon: Icons.support,     color: C.warning },
];

export default function App() {
  const [isAuth, setIsAuth] = useState(() => !!getAdminToken());
  const [page, setPage] = useState<Page>('dashboard');

  if (!isAuth) return <LoginPage onLogin={() => setIsAuth(true)} />;

  const logout = () => { clearAdminToken(); setIsAuth(false); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside style={{
        width: '240px',
        background: C.sidebar,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${C.sidebarBorder}`,
      }}>

        {/* Brand */}
        <div style={{ padding: '1.5rem 1.25rem 1.25rem', borderBottom: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '36px', height: '36px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(59,130,246,0.35)',
              flexShrink: 0,
            }}>
              <Icon d={Icons.bolt} size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>KASTRA</div>
              <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginTop: '1px' }}>Super Admin Console</div>
            </div>
          </div>
          {/* Status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '0.75rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
            <span style={{ fontSize: '0.6875rem', color: C.textMuted }}>System operational</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.75rem 0.625rem' }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 0.625rem', marginBottom: '0.5rem' }}>
            Navigation
          </div>
          {NAV.map(item => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.625rem 0.75rem',
                  marginBottom: '2px',
                  background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                  color: active ? '#93c5fd' : C.textSecondary,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                    (e.currentTarget as HTMLButtonElement).style.color = C.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = C.textSecondary;
                  }
                }}
              >
                <div style={{
                  width: '30px', height: '30px',
                  borderRadius: '8px',
                  background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  color: active ? item.color : C.textMuted,
                  transition: 'all 0.12s ease',
                }}>
                  <Icon d={item.icon} size={14} />
                </div>
                {item.label}
                {active && (
                  <div style={{
                    marginLeft: 'auto',
                    width: '6px', height: '6px',
                    borderRadius: '50%',
                    background: C.accent,
                    flexShrink: 0,
                  }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '0.75rem 0.625rem', borderTop: `1px solid ${C.sidebarBorder}` }}>
          {/* Admin identity */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 0.75rem', marginBottom: '4px',
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6875rem', color: '#fff', fontWeight: 800,
            }}>
              {getAdminEmail().charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.6875rem', color: C.textSecondary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getAdminEmail()}
              </div>
              <div style={{ fontSize: '0.5625rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Super Admin</div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              width: '100%',
              padding: '0.5rem 0.75rem',
              background: 'transparent',
              color: '#ef4444',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <div style={{
              width: '28px', height: '28px',
              borderRadius: '8px',
              background: 'rgba(239,68,68,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon d={Icons.logout} size={13} color="#ef4444" />
            </div>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', background: C.bg }}>
        {/* Top bar */}
        <div style={{
          padding: '1rem 2rem',
          borderBottom: `1px solid ${C.sidebarBorder}`,
          background: C.sidebar,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, lineHeight: 1 }}>
              {NAV.find(n => n.id === page)?.label}
            </h1>
            <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '2px' }}>
              KASTRA POS Platform Administration
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              padding: '0.375rem 0.75rem',
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '20px',
              fontSize: '0.75rem',
              color: C.success,
              fontWeight: 600,
            }}>
              LIVE
            </div>
          </div>
        </div>

        <div style={{ padding: '2rem' }} className="fade-in">
          {page === 'dashboard'    && <DashboardPage />}
          {page === 'businesses'   && <BusinessesPage />}
          {page === 'license-keys' && <LicenseKeysPage />}
          {page === 'referrals'    && <ReferralsPage />}
          {page === 'support'      && <SupportPage />}
        </div>
      </main>
    </div>
  );
}
