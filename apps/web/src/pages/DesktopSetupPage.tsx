/**
 * Desktop Installation Wizard — only shown in Tauri context on first launch.
 *
 * Steps:
 *  0  Welcome
 *  1  License Key (purchased customers enter KPS-XXXX key)
 *  2  Installation Mode (SERVER / CLIENT / STANDALONE)
 *  3  Client — enter server URL + test connection   [CLIENT only]
 *  4  Done → redirect to login
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ShoppingCart, Key, Server, Monitor, Wifi, CheckCircle,
  ChevronRight, ChevronLeft, AlertCircle, Loader2, RefreshCw,
  ArrowRight, Shield,
} from 'lucide-react';

// ─── Tauri invoke shim ────────────────────────────────────────────────────────
// We call Tauri commands through the global __TAURI__ object so the web build
// does not need to import @tauri-apps/api (avoids build errors in non-Tauri env).

declare global {
  interface Window {
    __TAURI__?: {
      invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (window.__TAURI__) {
    return window.__TAURI__.invoke<T>(cmd, args);
  }
  // Fallback for browser dev — simulate responses
  if (cmd === 'get_machine_id') return Promise.resolve({ machine_id: 'dev-machine-001', hostname: 'localhost' } as T);
  if (cmd === 'validate_license_key') return Promise.resolve(true as T);
  if (cmd === 'get_setup_mode') return Promise.resolve({ mode: 'UNSET', server_url: null, store_id: null } as T);
  if (cmd === 'set_setup_mode') return Promise.resolve(true as T);
  if (cmd === 'test_server_connection') return Promise.resolve(true as T);
  return Promise.resolve(null as T);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'SERVER' | 'CLIENT' | 'STANDALONE';
type Step = 0 | 1 | 2 | 3 | 4;

interface SetupConfig {
  mode: string;
  server_url: string | null;
  store_id: string | null;
}

// ─── Mode cards ───────────────────────────────────────────────────────────────

const MODES: Array<{
  value: Mode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  details: string[];
  color: string;
}> = [
  {
    value: 'STANDALONE',
    label: 'Standalone',
    icon: Monitor,
    desc: 'Single computer — everything on this machine.',
    details: [
      'API + database run locally on this PC',
      'No network required after setup',
      'Best for single-cashier businesses',
    ],
    color: 'blue',
  },
  {
    value: 'SERVER',
    label: 'Server',
    icon: Server,
    desc: 'This PC is the server. Other terminals connect to it.',
    details: [
      'Runs the API + database on this machine',
      'Other PCs connect via local network',
      'Best for multi-cashier or multi-terminal setup',
    ],
    color: 'purple',
  },
  {
    value: 'CLIENT',
    label: 'Client',
    icon: Wifi,
    desc: 'Connect to a KASTRA server on your network.',
    details: [
      'This PC is a cashier terminal only',
      'Data lives on the server machine',
      'Requires a running KASTRA Server on the network',
    ],
    color: 'emerald',
  },
];

const COLOR_MAP: Record<string, string> = {
  blue:    'border-blue-500 bg-blue-50',
  purple:  'border-purple-500 bg-purple-50',
  emerald: 'border-emerald-500 bg-emerald-50',
};
const ICON_COLOR: Record<string, string> = {
  blue:    'text-blue-600 bg-blue-100',
  purple:  'text-purple-600 bg-purple-100',
  emerald: 'text-emerald-600 bg-emerald-100',
};

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Welcome', 'License', 'Mode', 'Network', 'Done'];

function StepBar({ current, mode }: { current: Step; mode: Mode | null }) {
  const visible = mode === 'CLIENT' ? STEPS : STEPS.filter((_, i) => i !== 3);
  const adjusted = mode === 'CLIENT' ? current : current > 3 ? current - 1 : current;
  return (
    <div className="flex items-center gap-1 px-6 py-3 bg-gray-50 border-b">
      {visible.map((label, i) => (
        <div key={label} className="flex items-center flex-1">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
            i < adjusted ? 'text-green-600' : i === adjusted ? 'text-blue-600 bg-blue-50' : 'text-gray-400'
          }`}>
            {i < adjusted ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">{i + 1}</span>}
            {label}
          </div>
          {i < visible.length - 1 && <div className={`flex-1 h-px mx-1 ${i < adjusted ? 'bg-green-300' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DesktopSetupPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [licenseValid, setLicenseValid] = useState(false);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [machineId, setMachineId] = useState('');
  const [serverUrl, setServerUrl] = useState('http://192.168.1.');
  const [connectStatus, setConnectStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);

  // On mount: load machine ID and check if already configured
  useEffect(() => {
    void (async () => {
      try {
        const info = await invoke<{ machine_id: string; hostname: string }>('get_machine_id');
        setMachineId(info.machine_id);
      } catch { /* ok */ }

      try {
        const cfg = await invoke<SetupConfig>('get_setup_mode');
        if (cfg.mode && cfg.mode !== 'UNSET' && cfg.mode !== 'STANDALONE') {
          // Already configured — go straight to login
          navigate('/');
        }
      } catch { /* first run */ }
    })();
  }, [navigate]);

  async function validateLicense() {
    const key = licenseKey.trim().toUpperCase();
    if (!key) { setLicenseError('Please enter your license key.'); return; }
    if (!key.startsWith('KPS-')) { setLicenseError('License key must start with KPS-'); return; }

    setLicenseLoading(true);
    setLicenseError('');
    try {
      const valid = await invoke<boolean>('validate_license_key', { key, machineId });
      if (valid) {
        setLicenseValid(true);
        setStep(2);
      } else {
        setLicenseError('Invalid license key. Please check the key or contact support.');
      }
    } catch (e) {
      setLicenseError('Validation failed: ' + String(e));
    } finally {
      setLicenseLoading(false);
    }
  }

  async function testConnection() {
    setConnectStatus('testing');
    try {
      const ok = await invoke<boolean>('test_server_connection', { serverUrl });
      setConnectStatus(ok ? 'ok' : 'fail');
    } catch {
      setConnectStatus('fail');
    }
  }

  async function finish() {
    setSaving(true);
    try {
      await invoke('set_setup_mode', {
        mode: mode ?? 'STANDALONE',
        serverUrl: mode === 'CLIENT' ? serverUrl : null,
        storeId: null,
      });
      // Mark setup as complete so App.tsx doesn't redirect back here
      localStorage.setItem('desktop-setup-done', '1');
      navigate('/');
    } catch (e) {
      toast.error('Failed to save configuration: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  const handleModeNext = () => {
    if (!mode) return;
    if (mode === 'CLIENT') {
      setStep(3);
    } else {
      setStep(4);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Step bar (hidden on welcome + done) */}
        {step > 0 && step < 4 && <StepBar current={step} mode={mode} />}

        <div className="p-8">

          {/* ── Step 0: Welcome ── */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <ShoppingCart className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">KASTRA POS</h1>
                <p className="text-gray-500 mt-1 text-sm">Enterprise Point of Sale — Desktop Edition</p>
                <div className="mt-3 inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <Shield className="w-3.5 h-3.5" /> First-time setup
                </div>
              </div>

              <div className="text-left space-y-2">
                {[
                  { icon: Key,    label: 'License Activation', desc: 'Verify your purchase' },
                  { icon: Server, label: 'Installation Mode',  desc: 'Standalone, Server, or Client' },
                  { icon: CheckCircle, label: 'Ready to Launch', desc: 'Start taking sales' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4.5 h-4.5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{label}</div>
                      <div className="text-xs text-gray-500">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-lg flex items-center justify-center gap-2 transition-colors"
              >
                Begin Setup <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── Step 1: License Key ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-3">
                  <Key className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">License Activation</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Enter the license key from your purchase confirmation email.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  License Key
                </label>
                <input
                  value={licenseKey}
                  onChange={(e) => {
                    setLicenseKey(e.target.value.toUpperCase());
                    setLicenseError('');
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void validateLicense(); }}
                  placeholder="KPS-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                  className="w-full border-2 rounded-xl px-4 py-3 font-mono text-sm tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                {licenseError && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {licenseError}
                  </div>
                )}
                {licenseValid && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" /> License verified
                  </div>
                )}
              </div>

              {/* Machine ID — shown so support can generate correct key */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Machine ID (for support)</div>
                <div className="font-mono text-xs text-gray-700 break-all">{machineId || 'Loading…'}</div>
                <div className="text-xs text-gray-400">Provide this to support if you need a license key generated for this machine.</div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => void validateLicense()}
                  disabled={licenseLoading || !licenseKey.trim()}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {licenseLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : <>Verify & Continue <ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 text-center py-1"
              >
                Skip — I'll activate later (trial mode)
              </button>
            </div>
          )}

          {/* ── Step 2: Installation Mode ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Installation Mode</h2>
                <p className="text-gray-500 text-sm mt-1">How will this computer be used?</p>
              </div>

              <div className="space-y-3">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      mode === m.value ? COLOR_MAP[m.color] : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${ICON_COLOR[m.color]}`}>
                        <m.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-800">{m.label}</span>
                          {mode === m.value && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{m.desc}</p>
                        <ul className="mt-2 space-y-0.5">
                          {m.details.map((d) => (
                            <li key={d} className="text-xs text-gray-400 flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />{d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(1)} className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleModeNext}
                  disabled={!mode}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Client — Server URL ── */}
          {step === 3 && mode === 'CLIENT' && (
            <div className="space-y-5">
              <div>
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-3">
                  <Wifi className="w-6 h-6 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Connect to Server</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Enter the IP address of the KASTRA Server on your local network.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Server URL</label>
                <input
                  value={serverUrl}
                  onChange={(e) => { setServerUrl(e.target.value); setConnectStatus('idle'); }}
                  placeholder="http://192.168.1.100:3010"
                  className="w-full border-2 rounded-xl px-4 py-3 font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  The server PC's local IP — found in Settings on the Server machine.
                </p>
              </div>

              <button
                onClick={() => void testConnection()}
                disabled={connectStatus === 'testing' || !serverUrl.trim()}
                className="w-full py-2.5 border-2 border-emerald-500 text-emerald-700 font-semibold rounded-xl hover:bg-emerald-50 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {connectStatus === 'testing'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</>
                  : <><RefreshCw className="w-4 h-4" /> Test Connection</>
                }
              </button>

              {connectStatus === 'ok' && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Connected successfully! Server is reachable.
                </div>
              )}
              {connectStatus === 'fail' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Cannot reach server. Check the IP address and ensure the server is running.
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(2)} className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={connectStatus !== 'ok'}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 4 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Setup Complete!</h2>
                <p className="text-gray-500 text-sm mt-2">
                  KASTRA POS is configured as a{' '}
                  <span className="font-semibold text-gray-700">
                    {mode === 'SERVER' ? 'Server' : mode === 'CLIENT' ? 'Client terminal' : 'Standalone'}
                  </span>{' '}
                  installation.
                </p>
                {mode === 'SERVER' && (
                  <p className="text-xs text-blue-600 mt-2 bg-blue-50 rounded-lg p-2">
                    Other cashier PCs can connect to this machine using your local IP address.
                    Find it in Settings → General after logging in.
                  </p>
                )}
                {mode === 'CLIENT' && (
                  <p className="text-xs text-emerald-700 mt-2 bg-emerald-50 rounded-lg p-2">
                    Connected to: <span className="font-mono font-bold">{serverUrl}</span>
                  </p>
                )}
              </div>

              <button
                onClick={() => void finish()}
                disabled={saving}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {saving
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                  : <><ArrowRight className="w-5 h-5" /> Launch KASTRA POS</>
                }
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
