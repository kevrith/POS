import { useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { Eye, EyeOff, Delete } from 'lucide-react';

type LoginMode = 'email' | 'pin';

const PIN_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'del'] as const;

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [pin, setPin] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, loginWithPin } = useAuthStore();

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

  async function handlePinLogin() {
    if (pin.length < 4) return;
    setError('');
    setLoading(true);
    try {
      await loginWithPin(pin, businessId || 'default');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN');
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
      if (next.length >= 4 && next.length <= 6) {
        void handlePinLogin();
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-8 text-white text-center">
          <h1 className="text-3xl font-bold">POS Kenya</h1>
          <p className="text-blue-200 text-sm mt-1">Enterprise Point of Sale</p>
        </div>

        {/* Mode toggle */}
        <div className="flex border-b">
          <button
            onClick={() => { setMode('email'); setError(''); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'email'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Email + Password
          </button>
          <button
            onClick={() => { setMode('pin'); setError(''); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'pin'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            PIN Login
          </button>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Email mode */}
          {mode === 'email' && (
            <form onSubmit={(e) => void handleEmailLogin(e)} className="space-y-4">
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
            </form>
          )}

          {/* PIN mode */}
          {mode === 'pin' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business ID (optional)</label>
                <input
                  type="text"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  className="w-full px-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave blank for default"
                />
              </div>

              {/* PIN display */}
              <div className="flex justify-center gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xl font-bold transition-colors ${
                      i < pin.length
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 bg-gray-50'
                    }`}
                  >
                    {i < pin.length ? '●' : ''}
                  </div>
                ))}
              </div>

              {/* PIN pad */}
              <div className="grid grid-cols-3 gap-3">
                {PIN_DIGITS.map((key, i) => (
                  <button
                    key={i}
                    onClick={() => handlePinPad(key)}
                    disabled={loading}
                    className={`h-14 rounded-xl font-bold text-lg transition-all active:scale-95 ${
                      key === 'clear'
                        ? 'bg-red-50 text-red-600 hover:bg-red-100 text-sm'
                        : key === 'del'
                          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center'
                          : 'bg-gray-100 hover:bg-blue-50 hover:text-blue-600 text-gray-800'
                    } disabled:opacity-50`}
                  >
                    {key === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : key === 'clear' ? 'CLEAR' : key}
                  </button>
                ))}
              </div>

              <button
                onClick={() => void handlePinLogin()}
                disabled={pin.length < 4 || loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign In with PIN'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
