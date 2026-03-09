import { useState } from 'react';
import { adminApi, setAdminToken } from '../lib/api';

interface Props { onLogin: () => void }

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token } = await adminApi.login(email, password);
      setAdminToken(token, email);
      onLogin();
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.75rem 1rem',
    background: '#020617',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: '0.9375rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: 'radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.1) 0%, transparent 60%), #0a0f1e',
      alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div className="fade-in" style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '20px',
        width: '100%', maxWidth: '420px',
        overflow: 'hidden',
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ padding: '2.5rem 2.5rem 2rem', textAlign: 'center', borderBottom: '1px solid #1e293b' }}>
          <div style={{
            width: '64px', height: '64px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            borderRadius: '18px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '1.25rem',
            boxShadow: '0 8px 28px rgba(59,130,246,0.45)',
            fontSize: '2rem',
          }}>⚡</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
            KASTRA Admin
          </h1>
          <p style={{ color: '#475569', fontSize: '0.8125rem', marginTop: '4px' }}>
            Platform administration portal
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: '2rem 2.5rem 2.5rem' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#94a3b8', marginBottom: '6px' }}>
                Email address
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                autoFocus placeholder="admin@kastrapos.co.ke"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
                onBlur={e => { e.target.style.borderColor = '#1e293b'; }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#94a3b8', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: '2.75rem' }}
                  onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
                  onBlur={e => { e.target.style.borderColor = '#1e293b'; }}
                />
                <button
                  type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px',
                  }}
                >
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '8px', padding: '0.75rem 1rem',
                color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '0.875rem',
                background: loading ? 'rgba(59,130,246,0.6)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff', border: 'none', borderRadius: '10px',
                fontSize: '0.9375rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(59,130,246,0.35)',
                transition: 'all 0.15s',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget).style.transform = 'translateY(0)'; }}
            >
              {loading ? 'Signing in…' : 'Sign In to Console'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.6875rem', color: '#1e293b' }}>
            KASTRA POS v1.01 · Secured admin console
          </div>
        </div>
      </div>
    </div>
  );
}
