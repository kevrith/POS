/**
 * Desktop Installation Wizard — only shown in Tauri context on first launch.
 *
 * Step flow:
 *
 *  STANDALONE / SERVER:   Welcome → License → Mode → Done
 *  CLOUD:                 Welcome → License → Mode → Network → Done
 *  CLIENT:                Welcome → License → Mode → Device Role → Network → Done
 *
 * Device roles (CLIENT only):
 *   FULL_POS   — standard cashier terminal, full POS + inventory
 *   CASHIER    — sales only, no management/settings
 *   KIOSK      — customer self-service ordering (fullscreen /kiosk route)
 *   KDS        — kitchen display only (fullscreen /kds route)
 *   MANAGER    — back office, reports, settings — no POS
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ShoppingCart, Key, Server, Monitor, Wifi, CheckCircle,
  ChevronRight, ChevronLeft, AlertCircle, Loader2, RefreshCw,
  ArrowRight, Shield, Tablet, ChefHat, BarChart3, User,
} from 'lucide-react';

// ─── Tauri invoke shim ────────────────────────────────────────────────────────

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Tauri v2: __TAURI_INTERNALS__ holds the invoke function
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> } }).__TAURI_INTERNALS__;
  if (internals?.invoke) return internals.invoke<T>(cmd, args);
  // Tauri v1 fallback
  if (window.__TAURI__) return (window.__TAURI__ as { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> }).invoke<T>(cmd, args);
  // Browser dev fallback
  if (cmd === 'get_machine_id')         return Promise.resolve({ machine_id: 'dev-machine-001', hostname: 'localhost' } as T);
  if (cmd === 'validate_license_key')   return Promise.resolve(true as T);
  if (cmd === 'get_setup_mode')         return Promise.resolve({ mode: 'UNCONFIGURED' } as T);
  if (cmd === 'set_setup_mode')         return Promise.resolve(true as T);
  if (cmd === 'reset_setup')            return Promise.resolve(true as T);
  if (cmd === 'test_server_connection') return Promise.resolve(true as T);
  if (cmd === 'discover_servers')       return Promise.resolve([] as T);
  if (cmd === 'get_cloud_url')          return Promise.resolve('https://pos-bhe5.onrender.com' as T);
  return Promise.resolve(null as T);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Topology   = 'STANDALONE' | 'SERVER' | 'CLIENT' | 'CLOUD';
type DeviceRole = 'FULL_POS' | 'CASHIER' | 'KIOSK' | 'KDS' | 'MANAGER';

interface DiscoveredServer { ip: string; port: number; hostname: string; url: string; }

// ─── Topology cards ───────────────────────────────────────────────────────────

const TOPOLOGIES: Array<{
  value: Topology;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  details: string[];
  badge?: string;
  color: string;
}> = [
  {
    value: 'CLOUD',
    label: 'Cloud (SaaS)',
    icon: ArrowRight,
    desc: 'Connect to KASTRA Cloud — data online, accessible from anywhere.',
    details: [
      'Data stored securely in the cloud',
      'Owner can monitor all branches remotely',
      'Requires internet connection',
    ],
    badge: 'Recommended',
    color: 'sky',
  },
  {
    value: 'STANDALONE',
    label: 'All-in-One / Standalone',
    icon: Monitor,
    desc: 'Single computer — API, database and UI all on this machine.',
    details: [
      'Works fully offline — no internet needed',
      'Best for single-cashier businesses',
      'Simplest setup',
    ],
    color: 'blue',
  },
  {
    value: 'SERVER',
    label: 'LAN Server',
    icon: Server,
    desc: 'This PC hosts the database. Other terminals connect over your local network.',
    details: [
      'Runs API + database on this machine',
      'Other PCs in the building connect as clients',
      'Works offline — no internet needed',
    ],
    color: 'purple',
  },
  {
    value: 'CLIENT',
    label: 'LAN Client / Kiosk',
    icon: Wifi,
    desc: 'Connect to an existing KASTRA Server or Cloud — choose what role this device plays.',
    details: [
      'Can be a cashier terminal, kiosk, or KDS',
      'Requires a running KASTRA Server on the network',
      'Device role chosen in the next step',
    ],
    color: 'emerald',
  },
];

// ─── Device Role cards ────────────────────────────────────────────────────────

const DEVICE_ROLES: Array<{
  value: DeviceRole;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  details: string[];
  warning?: string;
  color: string;
}> = [
  {
    value: 'FULL_POS',
    label: 'Full POS Terminal',
    icon: ShoppingCart,
    desc: 'Complete access — cashier, inventory, management.',
    details: [
      'Full POS, sales history, inventory',
      'Access to reports and settings',
      'Suitable for main cashier or manager workstation',
    ],
    color: 'blue',
  },
  {
    value: 'CASHIER',
    label: 'Cashier Only',
    icon: User,
    desc: 'Sales and payments only — management sections locked.',
    details: [
      'POS, checkout and payments',
      'No inventory or settings access',
      'Best for dedicated cashier station',
    ],
    color: 'indigo',
  },
  {
    value: 'KIOSK',
    label: 'Customer Kiosk Terminal',
    icon: Tablet,
    desc: 'This screen is primarily used for customer self-service ordering.',
    details: [
      'Normal POS login after setup',
      'Staff can launch Kiosk Mode from the POS screen',
      'Works for any business type — optional feature',
    ],
    color: 'orange',
  },
  {
    value: 'KDS',
    label: 'Kitchen Display (KDS)',
    icon: ChefHat,
    desc: 'This screen is primarily used by kitchen staff to view orders.',
    details: [
      'Normal login after setup',
      'Staff can launch KDS fullscreen from the Hospitality screen',
      'Ideal for restaurants with a dedicated kitchen monitor',
    ],
    color: 'red',
  },
  {
    value: 'MANAGER',
    label: 'Manager / Back Office',
    icon: BarChart3,
    desc: 'Reports, inventory, HR and settings — no POS.',
    details: [
      'Full access to reports, analytics',
      'Inventory, suppliers, HR management',
      'POS / checkout tabs hidden',
    ],
    color: 'purple',
  },
];

// ─── Colour helpers ───────────────────────────────────────────────────────────

const BORDER_BG: Record<string, string> = {
  sky:     'border-sky-500 bg-sky-50',
  blue:    'border-blue-500 bg-blue-50',
  purple:  'border-purple-500 bg-purple-50',
  emerald: 'border-emerald-500 bg-emerald-50',
  indigo:  'border-indigo-500 bg-indigo-50',
  orange:  'border-orange-500 bg-orange-50',
  red:     'border-red-500 bg-red-50',
};
const ICON_CLS: Record<string, string> = {
  sky:     'text-sky-600 bg-sky-100',
  blue:    'text-blue-600 bg-blue-100',
  purple:  'text-purple-600 bg-purple-100',
  emerald: 'text-emerald-600 bg-emerald-100',
  indigo:  'text-indigo-600 bg-indigo-100',
  orange:  'text-orange-600 bg-orange-100',
  red:     'text-red-600 bg-red-100',
};

// ─── Step bar ─────────────────────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1 px-6 py-3 bg-gray-50/80 border-b border-gray-100">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center flex-1 min-w-0">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
            i < current
              ? 'text-green-600'
              : i === current
              ? 'text-blue-600 bg-blue-50'
              : 'text-gray-400'
          }`}>
            {i < current
              ? <CheckCircle className="w-3 h-3 flex-shrink-0" />
              : <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-current flex items-center justify-center text-[9px] flex-shrink-0">{i + 1}</span>
            }
            {label}
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mx-1 ${i < current ? 'bg-green-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Wizard steps enum ────────────────────────────────────────────────────────

const S = { WELCOME: 0, LICENSE: 1, TOPOLOGY: 2, ROLE: 3, NETWORK: 4, DONE: 5 } as const;

// ─── Main component ───────────────────────────────────────────────────────────

export default function DesktopSetupPage() {
  const navigate = useNavigate();

  const [step,          setStep]          = useState<number>(S.WELCOME);
  const [topology,      setTopology]      = useState<Topology | null>(null);
  const [deviceRole,    setDeviceRole]    = useState<DeviceRole>('FULL_POS');
  const [licenseKey,    setLicenseKey]    = useState('');
  const [licenseError,  setLicenseError]  = useState('');
  const [licenseValid,  setLicenseValid]  = useState(false);
  const [licenseLoading,setLicenseLoading]= useState(false);
  const [machineId,     setMachineId]     = useState('');
  const [serverUrl,     setServerUrl]     = useState('http://192.168.1.');
  const [connectStatus, setConnectStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [scanning,      setScanning]      = useState(false);
  const [discovered,    setDiscovered]    = useState<DiscoveredServer[]>([]);
  const [cloudUrl,      setCloudUrl]      = useState('https://pos-bhe5.onrender.com');
  const [terminalName,  setTerminalName]  = useState('');
  const [saving,        setSaving]        = useState(false);

  /* Derive which steps to show in the step bar */
  const visibleSteps = (() => {
    if (!topology || topology === 'STANDALONE' || topology === 'SERVER')
      return ['Welcome', 'License', 'Mode', 'Done'];
    if (topology === 'CLOUD')
      return ['Welcome', 'License', 'Mode', 'Network', 'Done'];
    // CLIENT
    return ['Welcome', 'License', 'Mode', 'Device Role', 'Network', 'Done'];
  })();

  /* Map wizard step index → step bar position */
  const stepBarPos = (() => {
    if (!topology || topology === 'STANDALONE' || topology === 'SERVER') {
      return [0, 1, 2, -1, -1, 3][step] ?? step;
    }
    if (topology === 'CLOUD') {
      return [0, 1, 2, -1, 3, 4][step] ?? step;
    }
    // CLIENT — all 6 steps map 1:1
    return step;
  })();

  useEffect(() => {
    void (async () => {
      try {
        const info = await invoke<{ machine_id: string; hostname: string }>('get_machine_id');
        setMachineId(info.machine_id);
        setTerminalName(`Terminal-${info.hostname}`);
      } catch { /* ok */ }

      try {
        const url = await invoke<string>('get_cloud_url');
        if (url) setCloudUrl(url);
      } catch { /* ok */ }

      // If already configured, redirect straight to app
      try {
        const cfg = await invoke<{ mode: string }>('get_setup_mode');
        if (cfg.mode && cfg.mode !== 'UNCONFIGURED') navigate('/');
      } catch { /* first run */ }
    })();
  }, [navigate]);

  /* ── Handlers ─────────────────────────────────────────────────────────────── */

  async function validateLicense() {
    const key = licenseKey.trim().toUpperCase();
    if (!key) { setLicenseError('Please enter your license key.'); return; }
    if (!key.startsWith('KPS-')) { setLicenseError('License key must start with KPS-'); return; }
    setLicenseLoading(true);
    setLicenseError('');
    try {
      const valid = await invoke<boolean>('validate_license_key', { key, machineId });
      if (valid) { setLicenseValid(true); setStep(S.TOPOLOGY); }
      else        setLicenseError('Invalid key. Please check the key or contact support.');
    } catch (e) {
      setLicenseError('Validation failed: ' + String(e));
    } finally {
      setLicenseLoading(false);
    }
  }

  function afterTopology() {
    if (!topology) return;
    if (topology === 'STANDALONE' || topology === 'SERVER') {
      setStep(S.DONE);          // No role or network step needed
    } else if (topology === 'CLOUD') {
      setServerUrl(cloudUrl);
      setStep(S.NETWORK);       // Skip role for cloud
    } else {
      setStep(S.ROLE);          // CLIENT → choose role first
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

  async function scanForServers() {
    setScanning(true); setDiscovered([]);
    try {
      const found = await invoke<DiscoveredServer[]>('discover_servers');
      setDiscovered(found);
      if (found.length === 0) toast.info('No servers found. Try entering the IP manually.');
    } catch (e) {
      toast.error('Scan failed: ' + String(e));
    } finally {
      setScanning(false);
    }
  }

  async function finish() {
    setSaving(true);
    try {
      const finalTopology  = topology ?? 'STANDALONE';
      const needsServerUrl = finalTopology === 'CLIENT' || finalTopology === 'CLOUD';
      const role           = (finalTopology === 'STANDALONE' || finalTopology === 'SERVER')
                               ? 'FULL_POS'
                               : deviceRole;

      await invoke('set_setup_mode', {
        mode:         finalTopology,
        deviceRole:   role,
        serverUrl:    needsServerUrl ? serverUrl : null,
        storeId:      null,
        licenseKey:   licenseValid ? licenseKey : null,
        terminalName: terminalName || null,
      });

      if (needsServerUrl) {
        localStorage.setItem('kastra-server-url', serverUrl);
      } else {
        // STANDALONE / SERVER: the API runs on this machine — point to localhost
        localStorage.setItem('kastra-server-url', 'http://localhost:3010');
      }

      localStorage.setItem('desktop-setup-done', '1');
      localStorage.setItem('desktop-device-role', role);

      // Full reload so api.ts re-resolves the API URL from localStorage.
      window.location.href = '/login';
    } catch (e) {
      toast.error('Failed to save: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  /* ── Render ───────────────────────────────────────────────────────────────── */

  const selectedRole = DEVICE_ROLES.find((r) => r.value === deviceRole);

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4"
         style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #1e3a5f 0%, #0a0f1e 70%)' }}>
      <div className="w-full max-w-[560px] bg-white rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden">

        {/* Step bar — hidden on welcome */}
        {step > S.WELCOME && step < S.DONE && (
          <StepBar steps={visibleSteps} current={stepBarPos} />
        )}

        <div className="p-8">

          {/* ── Step 0: Welcome ──────────────────────────────────────────── */}
          {step === S.WELCOME && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <ShoppingCart className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">KASTRA POS</h1>
                <p className="text-gray-500 mt-1 text-sm">Enterprise Point of Sale · Desktop Edition</p>
                <div className="mt-3 inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <Shield className="w-3.5 h-3.5" /> First-time installation wizard
                </div>
              </div>

              <div className="text-left space-y-2">
                {[
                  { icon: Key,         label: 'License Activation',  desc: 'Verify your purchase (optional trial)' },
                  { icon: Server,      label: 'Installation Mode',   desc: 'Standalone, Server, Client, or Cloud' },
                  { icon: Tablet,      label: 'Device Role',         desc: 'POS terminal, kiosk, KDS, or back office' },
                  { icon: CheckCircle, label: 'Ready to Launch',     desc: 'Start taking sales immediately' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-[18px] h-[18px] text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{label}</div>
                      <div className="text-xs text-gray-500">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(S.LICENSE)}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[15px] flex items-center justify-center gap-2 transition-colors shadow-lg"
              >
                Begin Setup <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── Step 1: License ──────────────────────────────────────────── */}
          {step === S.LICENSE && (
            <div className="space-y-6">
              <div>
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-3">
                  <Key className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">License Activation</h2>
                <p className="text-gray-500 text-sm mt-1">Enter the license key from your purchase email.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">License Key</label>
                <input
                  value={licenseKey}
                  onChange={(e) => { setLicenseKey(e.target.value.toUpperCase()); setLicenseError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void validateLicense(); }}
                  placeholder="KPS-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                  className="w-full border-2 rounded-xl px-4 py-3 font-mono text-sm tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

              <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Machine ID · share this with your vendor to generate a license key</div>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-xs text-gray-700 break-all select-all flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2">{machineId || 'Loading…'}</div>
                  <button
                    onClick={() => {
                      if (machineId) {
                        navigator.clipboard.writeText(machineId);
                        toast.success('Machine ID copied!');
                      }
                    }}
                    disabled={!machineId}
                    className="flex-shrink-0 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Send this ID to your KASTRA vendor — they'll generate a license key tied to this machine.</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(S.WELCOME)} className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => void validateLicense()}
                  disabled={licenseLoading || !licenseKey.trim()}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {licenseLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                    : <>Verify & Continue <ChevronRight className="w-4 h-4" /></>
                  }
                </button>
              </div>

              <button
                onClick={() => setStep(S.TOPOLOGY)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                Skip — I'll activate later (trial mode)
              </button>
            </div>
          )}

          {/* ── Step 2: Topology ─────────────────────────────────────────── */}
          {step === S.TOPOLOGY && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Installation Mode</h2>
                <p className="text-gray-500 text-sm mt-1">How will this computer be used in your setup?</p>
              </div>

              <div className="space-y-2.5">
                {TOPOLOGIES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTopology(t.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      topology === t.value ? BORDER_BG[t.color] : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${ICON_CLS[t.color]}`}>
                        <t.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[13px] text-gray-800">{t.label}</span>
                          {t.badge && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{t.badge}</span>}
                          {topology === t.value && <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                        {topology === t.value && (
                          <ul className="mt-2 space-y-0.5">
                            {t.details.map((d) => (
                              <li key={d} className="text-[11px] text-gray-400 flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />{d}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(S.LICENSE)} className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={afterTopology}
                  disabled={!topology}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Device Role (CLIENT only) ────────────────────────── */}
          {step === S.ROLE && (
            <div className="space-y-5">
              <div>
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-3">
                  <Tablet className="w-6 h-6 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Device Role</h2>
                <p className="text-gray-500 text-sm mt-1">
                  What will this terminal be used for? This controls which screens are visible and how the app launches.
                </p>
              </div>

              <div className="space-y-2">
                {DEVICE_ROLES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setDeviceRole(r.value)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
                      deviceRole === r.value ? BORDER_BG[r.color] : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${ICON_CLS[r.color]}`}>
                        <r.icon className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[13px] text-gray-800">{r.label}</span>
                          {deviceRole === r.value && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{r.desc}</p>
                        {deviceRole === r.value && r.warning && (
                          <div className="mt-1.5 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                            <span className="text-[11px] text-amber-700">{r.warning}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(S.TOPOLOGY)} className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(S.NETWORK)}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Network / Server URL ─────────────────────────────── */}
          {step === S.NETWORK && (topology === 'CLIENT' || topology === 'CLOUD') && (
            <div className="space-y-5">
              <div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${topology === 'CLOUD' ? 'bg-sky-100' : 'bg-emerald-100'}`}>
                  {topology === 'CLOUD'
                    ? <ArrowRight className="w-6 h-6 text-sky-600" />
                    : <Wifi className="w-6 h-6 text-emerald-600" />
                  }
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {topology === 'CLOUD' ? 'Connect to KASTRA Cloud' : 'Connect to LAN Server'}
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  {topology === 'CLOUD'
                    ? 'Your data is stored securely in the cloud.'
                    : 'Find the KASTRA Server on your network or enter its IP manually.'}
                </p>
              </div>

              {topology === 'CLOUD' && (
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sky-700 font-semibold text-sm mb-1">
                    <Shield className="w-4 h-4" /> KASTRA Cloud
                  </div>
                  <div className="font-mono text-sm text-sky-800 bg-white border border-sky-200 rounded-lg px-3 py-2">{cloudUrl}</div>
                  <p className="text-xs text-sky-600 mt-1">Official cloud server — your data is isolated and encrypted.</p>
                </div>
              )}

              {topology === 'CLIENT' && (
                <>
                  <button
                    onClick={() => void scanForServers()}
                    disabled={scanning}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {scanning
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</>
                      : <><RefreshCw className="w-4 h-4" /> Scan for KASTRA Servers</>
                    }
                  </button>

                  {discovered.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{discovered.length} server{discovered.length > 1 ? 's' : ''} found</p>
                      {discovered.map((s) => (
                        <button
                          key={s.url}
                          onClick={() => { setServerUrl(s.url); setConnectStatus('idle'); }}
                          className={`w-full text-left p-3 rounded-xl border-2 transition-all ${serverUrl === s.url ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-sm">{s.hostname}</div>
                              <div className="font-mono text-xs text-gray-500">{s.url}</div>
                            </div>
                            {serverUrl === s.url && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                          </div>
                        </button>
                      ))}
                      <div className="border-t border-dashed border-gray-200 pt-1" />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Server URL</label>
                    <input
                      value={serverUrl}
                      onChange={(e) => { setServerUrl(e.target.value); setConnectStatus('idle'); }}
                      placeholder="http://192.168.1.100:3010"
                      className="w-full border-2 rounded-xl px-4 py-3 font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    <p className="text-xs text-gray-400 mt-1">Find the IP in Settings → General on the Server PC.</p>
                  </div>
                </>
              )}

              {/* Terminal name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Terminal Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  value={terminalName}
                  onChange={(e) => setTerminalName(e.target.value)}
                  placeholder="e.g. Cashier-1, Kiosk-Main-Entrance"
                  className="w-full border-2 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Shown in the admin panel so you can identify which terminal is which.</p>
              </div>

              {/* Test connection */}
              <button
                onClick={() => void testConnection()}
                disabled={connectStatus === 'testing' || !serverUrl.trim()}
                className="w-full py-2.5 border-2 border-blue-400 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {connectStatus === 'testing'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</>
                  : <><CheckCircle className="w-4 h-4" /> Test Connection</>
                }
              </button>

              {connectStatus === 'ok' && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Connected to <span className="font-mono font-semibold ml-1">{serverUrl}</span>
                </div>
              )}
              {connectStatus === 'fail' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Cannot reach server. Check the IP and ensure the server is running.
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setStep(topology === 'CLIENT' ? S.ROLE : S.TOPOLOGY)}
                  className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(S.DONE)}
                  disabled={connectStatus !== 'ok'}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Done ─────────────────────────────────────────────── */}
          {step === S.DONE && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Setup Complete!</h2>
                <p className="text-gray-500 text-sm mt-2">This terminal is configured as:</p>
              </div>

              {/* Summary card */}
              <div className="text-left bg-gray-50 rounded-2xl border border-gray-200 divide-y divide-gray-200 overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mode</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {topology === 'CLOUD' ? 'Cloud (SaaS)'
                      : topology === 'SERVER' ? 'LAN Server'
                      : topology === 'CLIENT' ? 'LAN Client'
                      : 'Standalone'}
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Device Role</span>
                  <span className={`text-sm font-semibold ${
                    deviceRole === 'KIOSK' ? 'text-orange-600'
                    : deviceRole === 'KDS'  ? 'text-red-600'
                    : 'text-blue-700'
                  }`}>
                    {selectedRole?.label ?? deviceRole}
                  </span>
                </div>
                {(topology === 'CLIENT' || topology === 'CLOUD') && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Server</span>
                    <span className="text-xs font-mono text-gray-700 truncate max-w-[260px]">{serverUrl}</span>
                  </div>
                )}
                {terminalName && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Terminal Name</span>
                    <span className="text-sm font-semibold text-gray-800">{terminalName}</span>
                  </div>
                )}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">License</span>
                  <span className={`text-sm font-semibold ${licenseValid ? 'text-green-600' : 'text-amber-600'}`}>
                    {licenseValid ? 'Activated' : 'Trial mode'}
                  </span>
                </div>
              </div>

              {(deviceRole === 'KIOSK' || deviceRole === 'KDS') && (
                <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-left">
                  <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-700">
                    After login you'll land on the normal{' '}
                    {deviceRole === 'KIOSK' ? 'POS screen. You can launch Kiosk Mode at any time from the POS toolbar.' : 'dashboard. You can launch KDS fullscreen from the Hospitality screen.'}
                  </div>
                </div>
              )}

              <button
                onClick={() => void finish()}
                disabled={saving}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg"
              >
                {saving
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Launching…</>
                  : <><ArrowRight className="w-5 h-5" /> Launch KASTRA POS</>
                }
              </button>

              <button
                onClick={() => setStep(topology === 'CLIENT' || topology === 'CLOUD' ? S.NETWORK : S.TOPOLOGY)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                ← Go back and change something
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
