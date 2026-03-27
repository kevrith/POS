import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../stores/auth';
import type { AuthUser } from '../stores/auth';
import { Eye, EyeOff, Delete, ChevronLeft, Building2, Sparkles, Fingerprint } from 'lucide-react';
import { isBiometricAvailable, authenticateBiometric } from '../lib/biometric';
import { setToken } from '../lib/api';

const PLAN_LABELS: Record<string, { label: string; color: string; price: string }> = {
  STARTER:    { label: 'Starter',    color: 'bg-emerald-500', price: 'KES 1,499/mo' },
  PRO:        { label: 'Pro',        color: 'bg-blue-600',    price: 'KES 3,999/mo' },
  ENTERPRISE: { label: 'Enterprise', color: 'bg-purple-600',  price: 'KES 9,999/mo' },
  LIFETIME:   { label: 'Lifetime',   color: 'bg-amber-500',   price: 'Pay once' },
};

type LoginMode = 'email' | 'pin' | 'register';
type PinStep = 'business' | 'staff' | 'pad';

const PIN_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'del'] as const;

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

const ROLE_COLORS: Record<string, string> = {
  OWNER:    'bg-purple-600',
  MANAGER:  'bg-blue-600',
  CASHIER:  'bg-emerald-600',
  WAITER:   'bg-amber-500',
  KITCHEN:  'bg-orange-500',
  ACCOUNTANT: 'bg-indigo-600',
};

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function LoginPage() {
  const navigate = useNavigate();

  // Read URL params on mount
  const urlParams = new URLSearchParams(window.location.search);
  const urlMode = urlParams.get('mode');
  const urlPlan = (urlParams.get('plan') ?? '').toUpperCase();

  const [mode, setMode] = useState<LoginMode>(urlMode === 'register' ? 'register' : 'email');

  // ── Email mode ──────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── PIN mode ─────────────────────────────────────────────────────────────────
  const [pinStep, setPinStep] = useState<PinStep>('business');
  const [businessIdInput, setBusinessIdInput] = useState('');
  const [savedBusinessId, setSavedBusinessId] = useState(''); // real UUID stored here
  const [resolvedBusinessName, setResolvedBusinessName] = useState('');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // ── Register mode ────────────────────────────────────────────────────────────
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regBusiness, setRegBusiness] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  // ── Forgot password ──────────────────────────────────────────────────────────
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json() as { sent: boolean };
      if (data.sent) setForgotSent(true);
      else setForgotError('Something went wrong. Please try again.');
    } catch {
      setForgotError('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const { login, loginWithPin, loginWithOAuth } = useAuthStore();
  const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

  // Handle OAuth redirect (legacy redirect flow fallback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('oauth_token');
    const businessId = params.get('oauth_businessId');
    const role = params.get('oauth_role');
    const name = params.get('oauth_name');
    const id = params.get('oauth_id');

    if (token && businessId && role && name && id) {
      const user: AuthUser = {
        id,
        name: decodeURIComponent(name),
        email: null,
        role: role as AuthUser['role'],
        businessId,
      };
      void loginWithOAuth(token, user).catch((err) => {
        setError(err instanceof Error ? err.message : 'OAuth login failed');
      });
      window.history.replaceState({}, '', '/');
    }
  }, [loginWithOAuth]);

  // Google login via @react-oauth/google (frontend-initiated flow)
  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/auth/google/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: tokenResponse.access_token }),
        });
        const data = await res.json() as { accessToken?: string; user?: AuthUser; message?: string };
        if (!res.ok) throw new Error(data.message ?? 'Google login failed');
        setToken(data.accessToken!);
        await loginWithOAuth(data.accessToken!, data.user!);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google login failed');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Google sign-in was cancelled or failed'),
  });

  // Check biometric availability on mount
  useEffect(() => {
    void isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  // On mount: check if businessId is already saved → skip directly to staff grid
  useEffect(() => {
    const stored = localStorage.getItem('pos-business-id') ?? '';
    const storedName = localStorage.getItem('pos-business-name') ?? '';
    if (stored) {
      setSavedBusinessId(stored);
      setResolvedBusinessName(storedName);
      setPinStep('staff');
      void loadStaff(stored);
    }
  }, []);

  async function loadStaff(bizId: string) {
    setStaffLoading(true);
    setStaff([]);
    try {
      const res = await fetch(`/api/v1/business/${bizId}/staff`);
      if (!res.ok) throw new Error('Not found');
      const data = (await res.json()) as StaffMember[];
      setStaff(data);
    } catch {
      // Invalid business ID — go back to business step
      setSavedBusinessId('');
      setResolvedBusinessName('');
      localStorage.removeItem('pos-business-id');
      localStorage.removeItem('pos-business-name');
      setPinStep('business');
    } finally {
      setStaffLoading(false);
    }
  }

  async function handleBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = businessIdInput.trim().toUpperCase();
    if (!code) return;
    setStaffLoading(true);
    try {
      // Resolve short code → real UUID
      const res = await fetch(`/api/v1/business/resolve/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error('Not found');
      const biz = (await res.json()) as { id: string; name: string; shortCode: string | null };
      localStorage.setItem('pos-business-id', biz.id);
      localStorage.setItem('pos-business-name', biz.name);
      setSavedBusinessId(biz.id);
      setResolvedBusinessName(biz.name);
      setPinStep('staff');
      void loadStaff(biz.id);
    } catch {
      setError('Business code not found. Check with your owner.');
      setStaffLoading(false);
    }
  }

  function selectStaff(member: StaffMember) {
    setSelectedUser(member);
    setPin('');
    setPinError('');
    setPinStep('pad');
  }

  // Keyboard support for PIN pad
  useEffect(() => {
    if (mode !== 'pin' || pinStep !== 'pad') return;
    function onKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') {
        handlePinPad(Number(e.key) as typeof PIN_DIGITS[number]);
      } else if (e.key === 'Backspace') {
        handlePinPad('del');
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        handlePinPad('clear');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pinStep, pin]);

  async function handlePinLogin(pinValue?: string) {
    const p = pinValue ?? pin;
    if (p.length < 4 || !selectedUser) return;
    setError('');
    setPinError('');
    setLoading(true);
    try {
      await loginWithPin(p, savedBusinessId, undefined, selectedUser?.id);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function handlePinPad(key: typeof PIN_DIGITS[number]) {
    if (key === 'clear') {
      setPin('');
    } else if (key === 'del') {
      setPin((p) => p.slice(0, -1));
    } else if (typeof key === 'number' && pin.length < 6) {
      const next = pin + key.toString();
      setPin(next);
      if (next.length >= 4) {
        // Pass next directly to avoid stale-closure issue with `pin` state
        setTimeout(() => void handlePinLogin(next), 120);
      }
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError('');
    if (regPassword !== regConfirm) {
      setRegError('Passwords do not match');
      return;
    }
    if (regPassword.length < 8) {
      setRegError('Password must be at least 8 characters');
      return;
    }
    setRegLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          businessName: regBusiness,
          ...(urlPlan ? { plan: urlPlan } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? 'Registration failed');
      }
      // Auto-login then redirect to setup wizard
      try {
        await login(regEmail, regPassword);
        navigate(urlPlan ? `/setup?plan=${urlPlan}` : '/setup');
      } catch {
        // If auto-login fails just show success and let them sign in manually
        setRegSuccess(true);
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegLoading(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, showTotp ? totpCode : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.toLowerCase().includes('totp')) {
        setShowTotp(true);
        setError('Please enter your 2FA code');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-gray-950">

      {/* ── Left branding panel (lg+) ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[440px] xl:w-[500px] flex-col relative overflow-hidden flex-shrink-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700">
        {/* Decorative circles */}
        <div className="absolute -top-28 -right-28 w-80 h-80 rounded-full bg-white/[0.06]" />
        <div className="absolute top-1/2 -left-20 w-56 h-56 rounded-full bg-white/[0.04]" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-white/[0.05]" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-12">
          {/* Logo row */}
          <div className="flex items-center gap-3 mb-auto">
            <div className="w-10 h-10 rounded-[10px] bg-white/15 border border-white/20 flex items-center justify-center shadow">
              <img src="/logo.png" alt="" className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div>
              <div className="text-white font-extrabold text-[15px] tracking-tight leading-tight">KASTRA POS</div>
              <div className="text-blue-200/60 text-[10px] font-bold tracking-[0.2em] uppercase mt-[1px]">Enterprise</div>
            </div>
          </div>

          {/* Headline */}
          <div className="my-12">
            <h1 className="text-4xl xl:text-[42px] font-extrabold text-white leading-[1.12] mb-4 tracking-tight">
              Run your business<br />with confidence
            </h1>
            <p className="text-blue-100/65 text-[15px] leading-relaxed max-w-[340px]">
              Enterprise POS built for Kenya — KRA eTIMS compliant, offline‑first, and ready to scale.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {[
              'KRA eTIMS compliant & KDPA ready',
              'Works offline, syncs automatically',
              'M-Pesa, card & split payments',
              'Multi-store & franchise management',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3 text-white/72 text-sm">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                {f}
              </div>
            ))}
          </div>

          <p className="text-blue-200/30 text-xs mt-10">Trusted by businesses across Kenya</p>
        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-4 xs:p-6 overflow-y-auto">
        <div className="w-full max-w-sm py-8">

          {/* Mobile logo (hidden when left panel is visible) */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/25">
              <img src="/logo.png" alt="" className="w-8 h-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">KASTRA POS</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enterprise Point of Sale</p>
          </div>

          {/* Pill-style mode tabs */}
          <div className="flex bg-gray-100 dark:bg-gray-800/80 rounded-xl p-1 mb-5 gap-1">
            {([
              { id: 'email' as LoginMode,    label: 'Sign In' },
              { id: 'pin' as LoginMode,      label: 'Staff PIN' },
              { id: 'register' as LoginMode, label: 'Register' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setMode(id); setError(''); setRegError(''); }}
                className={`flex-1 py-2 rounded-lg text-xs xs:text-sm font-semibold transition-all duration-150 ${
                  mode === id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Form card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card border border-gray-200/80 dark:border-gray-700/60">
        <div className="p-6 xs:p-8">

          {/* ── Register mode ──────────────────────────────────────────────── */}
          {mode === 'register' && (
            regSuccess ? (
              <div className="py-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Account created!</h3>
                  <p className="text-sm text-gray-500 mt-1">Your business account is ready. Sign in to get started.</p>
                </div>
                <button
                  onClick={() => { setMode('email'); setEmail(regEmail); setRegSuccess(false); }}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
                >
                  Go to Sign In →
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void handleRegister(e)} className="space-y-4">
                {/* Plan context banner */}
                {urlPlan && PLAN_LABELS[urlPlan] && (
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white ${PLAN_LABELS[urlPlan].color}`}>
                    <Sparkles className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight">{PLAN_LABELS[urlPlan].label} Plan — 30-day free trial</p>
                      <p className="text-xs opacity-80">Then {PLAN_LABELS[urlPlan].price} · Cancel anytime</p>
                    </div>
                  </div>
                )}
                {regError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{regError}</div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Full Name</label>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Jane Waweru"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={regBusiness}
                    onChange={(e) => setRegBusiness(e.target.value)}
                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Premier Cafe Ltd"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="jane@yourbusiness.co.ke"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Min. 8 characters"
                      required
                    />
                    <button type="button" onClick={() => setShowRegPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showRegPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Re-enter password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {regLoading ? 'Creating account…' : 'Create Account →'}
                </button>
                <p className="text-center text-xs text-gray-400">
                  Already have an account?{' '}
                  <button type="button" onClick={() => setMode('email')} className="text-blue-600 font-semibold hover:underline">Sign in</button>
                </p>
              </form>
            )
          )}

          {/* ── Email mode ─────────────────────────────────────────────────── */}
          {mode === 'email' && (
            <form onSubmit={(e) => void handleEmailLogin(e)} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="owner@business.com"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {showTotp && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">2FA Code (Authenticator App)</label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

              {/* Forgot password link */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setShowForgot(v => !v); setForgotSent(false); setForgotError(''); setForgotEmail(email); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                >
                  Forgot your password?
                </button>
              </div>

              {/* Forgot password inline panel */}
              {showForgot && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                  {forgotSent ? (
                    <div className="text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">Check your email</p>
                      <p className="text-xs text-gray-500">If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent. It expires in 15 minutes.</p>
                      <button
                        type="button"
                        onClick={() => { setShowForgot(false); setForgotSent(false); }}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Back to sign in
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={(e) => void handleForgotPassword(e)} className="space-y-3">
                      <p className="text-xs text-gray-600 font-medium">Enter your email and we'll send a reset link</p>
                      {forgotError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{forgotError}</p>
                      )}
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                        placeholder="your@email.com"
                        required
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={forgotLoading}
                          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowForgot(false)}
                          className="px-3 py-2 bg-white border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400 font-medium">OR</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              <button
                type="button"
                onClick={() => handleGoogleLogin()}
                className="flex items-center justify-center gap-3 w-full py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors text-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
            </form>
          )}

          {/* ── PIN mode ───────────────────────────────────────────────────── */}
          {mode === 'pin' && (
            <div>

              {/* Step 1: Enter Business Code */}
              {pinStep === 'business' && (
                <form onSubmit={handleBusinessSubmit} className="space-y-5">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
                      <Building2 className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="font-bold text-gray-800">Enter Business Code</h3>
                    <p className="text-sm text-gray-500 mt-1">Owner can copy this from Settings → General</p>
                  </div>
                  <input
                    type="text"
                    value={businessIdInput}
                    onChange={(e) => { setBusinessIdInput(e.target.value.toUpperCase()); setError(''); }}
                    className="w-full px-4 py-3 border-2 rounded-xl text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center font-mono tracking-widest uppercase"
                    placeholder="e.g. PREMIE01"
                    autoFocus
                    maxLength={12}
                  />
                  {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                  <button
                    type="submit"
                    disabled={!businessIdInput.trim() || staffLoading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
                  >
                    {staffLoading ? 'Searching…' : 'Continue'}
                  </button>
                </form>
              )}

              {/* Step 2: Staff grid (QuickBooks-style) */}
              {pinStep === 'staff' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-800">Who are you?</h3>
                      {resolvedBusinessName && (
                        <p className="text-xs text-blue-600 font-medium">{resolvedBusinessName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        localStorage.removeItem('pos-business-id');
                        localStorage.removeItem('pos-business-name');
                        setSavedBusinessId('');
                        setResolvedBusinessName('');
                        setBusinessIdInput('');
                        setPinStep('business');
                      }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                    >
                      <Building2 className="w-3 h-3" />
                      Change Business
                    </button>
                  </div>

                  {staffLoading && (
                    <div className="py-8 flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-gray-400">Loading staff…</p>
                    </div>
                  )}

                  {!staffLoading && staff.length === 0 && (
                    <div className="py-8 text-center">
                      <p className="text-gray-500 text-sm">No staff with PIN found.</p>
                      <p className="text-gray-400 text-xs mt-1">Ask the owner to set up staff PINs in HR → Staff.</p>
                    </div>
                  )}

                  {!staffLoading && staff.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {staff.map((member) => (
                        <button
                          key={member.id}
                          onClick={() => selectStaff(member)}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-transparent hover:border-blue-300 hover:bg-blue-50 transition-all group"
                        >
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                              ROLE_COLORS[member.role] ?? 'bg-gray-500'
                            }`}
                          >
                            {initials(member.name)}
                          </div>
                          <div className="text-center">
                            <div className="text-xs font-semibold text-gray-700 leading-tight line-clamp-2">
                              {member.name.split(' ')[0]}
                            </div>
                            <div className="text-[10px] text-gray-400 capitalize">{member.role.toLowerCase()}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: PIN numpad */}
              {pinStep === 'pad' && selectedUser && (
                <div className="space-y-5">
                  {/* Back + user identity */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setPinStep('staff'); setPin(''); setPinError(''); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                          ROLE_COLORS[selectedUser.role] ?? 'bg-gray-500'
                        }`}
                      >
                        {initials(selectedUser.name)}
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 text-sm">{selectedUser.name}</div>
                        <div className="text-xs text-gray-400 capitalize">{selectedUser.role.toLowerCase()}</div>
                      </div>
                    </div>
                  </div>

                  <p className="text-center text-sm text-gray-600">Enter your PIN</p>

                  {/* PIN dots */}
                  <div className="flex justify-center gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                          i < pin.length
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 bg-gray-50'
                        }`}
                      >
                        {i < pin.length && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                      </div>
                    ))}
                  </div>

                  {pinError && (
                    <div className="text-center text-sm text-red-600 bg-red-50 py-2 rounded-lg">
                      {pinError}
                    </div>
                  )}

                  {/* Biometric login button */}
                  {biometricAvailable && (
                    <button
                      type="button"
                      disabled={biometricLoading || loading}
                      onClick={async () => {
                        if (!selectedUser) return;
                        setBiometricLoading(true);
                        setPinError('');
                        try {
                          // Retrieve stored credential IDs for this user from localStorage
                          const stored = localStorage.getItem(`biometric-creds-${selectedUser.id}`);
                          const credentialIds: string[] = stored ? JSON.parse(stored) : [];
                          if (credentialIds.length === 0) {
                            setPinError('No biometric registered for this account. Use PIN instead.');
                            return;
                          }
                          const assertion = await authenticateBiometric({ credentialIds });
                          // Send assertion to backend for verification — use a special biometric PIN token
                          // The assertion is passed as the pin value encoded as JSON
                          const assertionPin = `__biometric__:${JSON.stringify(assertion)}`;
                          await loginWithPin(assertionPin, savedBusinessId, undefined, selectedUser.id);
                        } catch (err) {
                          setPinError(err instanceof Error ? err.message : 'Biometric failed');
                        } finally {
                          setBiometricLoading(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 border-2 border-blue-200 rounded-xl text-blue-600 font-semibold text-sm hover:bg-blue-50 disabled:opacity-50 transition-colors"
                    >
                      {biometricLoading
                        ? <><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Verifying…</>
                        : <><Fingerprint className="w-5 h-5" /> Use Fingerprint / Face ID</>}
                    </button>
                  )}

                  {/* Numpad */}
                  <div className="grid grid-cols-3 gap-2">
                    {PIN_DIGITS.map((key, i) => (
                      <button
                        key={i}
                        onClick={() => handlePinPad(key)}
                        disabled={loading}
                        className={`h-13 py-3.5 rounded-xl font-bold text-lg transition-all active:scale-95 ${
                          key === 'clear'
                            ? 'bg-red-50 text-red-600 hover:bg-red-100 text-sm'
                            : key === 'del'
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center'
                              : 'bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-800'
                        } disabled:opacity-50`}
                      >
                        {key === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : key === 'clear' ? 'CLEAR' : key}
                      </button>
                    ))}
                  </div>

                  {loading && (
                    <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Signing in…
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
