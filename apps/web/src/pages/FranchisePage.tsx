import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import {
  Building2, TrendingUp, DollarSign, Users, Link2, Unlink,
  Download, AlertTriangle, ChevronUp, ChevronDown, RefreshCw,
  CheckCircle, XCircle,
} from 'lucide-react';

const formatKES = (cents: number) => 'KES ' + (cents / 100).toFixed(2);

type Tab = 'network' | 'dashboard' | 'settings';

interface FranchiseeStat {
  id: string;
  name: string;
  planName: string;
  storeCount: number;
  userCount: number;
  monthlyGMVCents: number;
  feeCents: number;
  royaltyCents: number;
  salesCount: number;
  franchiseFee: number | null;
  royaltyRate: number | null;
  performanceRatio?: number;
}

interface NetworkData {
  business: {
    id: string;
    name: string;
    parentBusiness: { id: string; name: string } | null;
  };
  franchisees: FranchiseeStat[];
}

interface DashboardData {
  totalFranchisees: number;
  totalGMVCents: number;
  totalFeeCents: number;
  totalRoyaltyCents: number;
  totalSales: number;
  avgGMVCents: number;
  franchiseePerformance: FranchiseeStat[];
}

interface SettingsData {
  franchiseFee: number | null;
  royaltyRate: number | null;
  parentBusinessId: string | null;
  parentBusiness: { id: string; name: string } | null;
}

export default function FranchisePage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';

  const [activeTab, setActiveTab] = useState<Tab>('network');

  // Network tab state
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState('');

  // Link form state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkFranchiseeId, setLinkFranchiseeId] = useState('');
  const [linkFee, setLinkFee] = useState('');
  const [linkRoyalty, setLinkRoyalty] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');

  // Dashboard tab state
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Settings tab state
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsFee, setSettingsFee] = useState('');
  const [settingsRoyalty, setSettingsRoyalty] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Sorting for network table
  const [sortField, setSortField] = useState<keyof FranchiseeStat>('monthlyGMVCents');
  const [sortAsc, setSortAsc] = useState(false);

  const loadNetwork = useCallback(async () => {
    if (!businessId) return;
    setNetworkLoading(true);
    setNetworkError('');
    try {
      const data = await api.get<NetworkData>(`/franchise/network?businessId=${businessId}`);
      setNetworkData(data);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setNetworkError(err?.message ?? 'Failed to load network');
    } finally {
      setNetworkLoading(false);
    }
  }, [businessId]);

  const loadDashboard = useCallback(async () => {
    if (!businessId) return;
    setDashLoading(true);
    try {
      const data = await api.get<DashboardData>(`/franchise/dashboard?businessId=${businessId}`);
      setDashData(data);
    } catch {
      // ignore
    } finally {
      setDashLoading(false);
    }
  }, [businessId]);

  const loadSettings = useCallback(async () => {
    if (!businessId) return;
    setSettingsLoading(true);
    try {
      const data = await api.get<SettingsData>(`/franchise/settings?businessId=${businessId}`);
      setSettings(data);
      setSettingsFee(String(data.franchiseFee ?? 0));
      setSettingsRoyalty(String(data.royaltyRate ?? 0));
    } catch {
      // ignore
    } finally {
      setSettingsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (activeTab === 'network') loadNetwork();
    if (activeTab === 'dashboard') loadDashboard();
    if (activeTab === 'settings') loadSettings();
  }, [activeTab, loadNetwork, loadDashboard, loadSettings]);

  // Link franchisee
  const handleLink = async () => {
    if (!businessId) return;
    setLinkLoading(true);
    setLinkError('');
    try {
      await api.post('/franchise/link', {
        franchiseeId: linkFranchiseeId.trim(),
        parentBusinessId: businessId,
        franchiseFee: parseFloat(linkFee) || 0,
        royaltyRate: parseFloat(linkRoyalty) || 0,
      });
      setShowLinkForm(false);
      setLinkFranchiseeId('');
      setLinkFee('');
      setLinkRoyalty('');
      loadNetwork();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setLinkError(err?.message ?? 'Failed to link franchisee');
    } finally {
      setLinkLoading(false);
    }
  };

  // Unlink franchisee
  const handleUnlink = async (franchiseeId: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from your franchise network? This will clear their fee and royalty settings.`)) return;
    try {
      await api.delete(`/franchise/link/${franchiseeId}`);
      loadNetwork();
    } catch (e: unknown) {
      const err = e as { message?: string };
      alert(err?.message ?? 'Failed to unlink');
    }
  };

  // Save settings
  const handleSaveSettings = async () => {
    if (!businessId) return;
    setSettingsSaving(true);
    try {
      await api.patch('/franchise/settings', {
        businessId,
        franchiseFee: parseFloat(settingsFee) || 0,
        royaltyRate: parseFloat(settingsRoyalty) || 0,
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
      loadSettings();
    } catch (e: unknown) {
      const err = e as { message?: string };
      alert(err?.message ?? 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Sort helper
  const toggleSort = (field: keyof FranchiseeStat) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const sortedFranchisees = (networkData?.franchisees ?? []).slice().sort((a, b) => {
    const av = (a[sortField] ?? 0) as number | string;
    const bv = (b[sortField] ?? 0) as number | string;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  // Export CSV
  const exportCSV = () => {
    if (!dashData) return;
    const rows: string[][] = [
      ['Franchisee', 'Monthly GMV', 'Fee Due', 'Royalty Due', 'Sales', 'Stores', 'Performance'],
      ...dashData.franchiseePerformance.map((f) => [
        f.name,
        (f.monthlyGMVCents / 100).toFixed(2),
        (f.feeCents / 100).toFixed(2),
        (f.royaltyCents / 100).toFixed(2),
        String(f.salesCount),
        String(f.storeCount),
        `${((f.performanceRatio ?? 0) * 100).toFixed(0)}%`,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `franchise-performance-${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sort icon helper
  const SortIcon = ({ field }: { field: keyof FranchiseeStat }) =>
    sortField === field ? (
      sortAsc
        ? <ChevronUp className="w-3 h-3 inline ml-1" />
        : <ChevronDown className="w-3 h-3 inline ml-1" />
    ) : null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Building2 className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Franchise Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your franchise network, track performance, and collect royalties
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1">
          {(['network', 'dashboard', 'settings'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab === 'network' ? 'Network' : tab === 'dashboard' ? 'Dashboard' : 'Settings'}
            </button>
          ))}
        </nav>
      </div>

      {/* NETWORK TAB */}
      {activeTab === 'network' && (
        <div className="space-y-4">
          {networkData?.business?.parentBusiness && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 flex items-center gap-3">
              <Link2 className="w-5 h-5 text-blue-500 shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-300">
                This business is a franchisee of{' '}
                <strong>{networkData.business.parentBusiness.name}</strong>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Franchisees ({networkData?.franchisees?.length ?? 0})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={loadNetwork}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button
                onClick={() => setShowLinkForm(!showLinkForm)}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Link2 className="w-4 h-4" /> Link Franchisee
              </button>
            </div>
          </div>

          {showLinkForm && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                Link a Franchisee Business
              </h3>
              {linkError && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4" /> {linkError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Franchisee Business ID *
                  </label>
                  <input
                    type="text"
                    value={linkFranchiseeId}
                    onChange={(e) => setLinkFranchiseeId(e.target.value)}
                    placeholder="e.g. biz-002"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Franchise Fee (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={linkFee}
                    onChange={(e) => setLinkFee(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Royalty Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={linkRoyalty}
                    onChange={(e) => setLinkRoyalty(e.target.value)}
                    placeholder="e.g. 3"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleLink}
                  disabled={!linkFranchiseeId.trim() || linkLoading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {linkLoading ? 'Linking...' : 'Link'}
                </button>
                <button
                  onClick={() => { setShowLinkForm(false); setLinkError(''); }}
                  className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {networkError && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {networkError}
            </div>
          )}

          {networkLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : sortedFranchisees.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No franchisees linked yet</p>
              <p className="text-sm mt-1">
                Use the "Link Franchisee" button to add businesses to your network
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase text-xs">
                  <tr>
                    <th
                      className="text-left px-4 py-3 cursor-pointer hover:text-gray-900 dark:hover:text-white"
                      onClick={() => toggleSort('name')}
                    >
                      Name <SortIcon field="name" />
                    </th>
                    <th
                      className="text-right px-4 py-3 cursor-pointer hover:text-gray-900 dark:hover:text-white"
                      onClick={() => toggleSort('monthlyGMVCents')}
                    >
                      Monthly GMV <SortIcon field="monthlyGMVCents" />
                    </th>
                    <th
                      className="text-right px-4 py-3 cursor-pointer hover:text-gray-900 dark:hover:text-white"
                      onClick={() => toggleSort('feeCents')}
                    >
                      Fee Due <SortIcon field="feeCents" />
                    </th>
                    <th
                      className="text-right px-4 py-3 cursor-pointer hover:text-gray-900 dark:hover:text-white"
                      onClick={() => toggleSort('royaltyCents')}
                    >
                      Royalty Due <SortIcon field="royaltyCents" />
                    </th>
                    <th
                      className="text-right px-4 py-3 cursor-pointer hover:text-gray-900 dark:hover:text-white"
                      onClick={() => toggleSort('storeCount')}
                    >
                      Stores <SortIcon field="storeCount" />
                    </th>
                    <th className="text-right px-4 py-3">Fee%</th>
                    <th className="text-right px-4 py-3">Royalty%</th>
                    <th className="text-center px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sortedFranchisees.map((f) => (
                    <tr
                      key={f.id}
                      className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{f.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{f.id}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                        {formatKES(f.monthlyGMVCents)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400 font-medium">
                        {formatKES(f.feeCents)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium">
                        {formatKES(f.royaltyCents)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {f.storeCount}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {f.franchiseFee ?? 0}%
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {f.royaltyRate ?? 0}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleUnlink(f.id, f.name)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Remove from network"
                        >
                          <Unlink className="w-3 h-3" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300">
                  <tr>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 uppercase">
                      Totals
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatKES(sortedFranchisees.reduce((s, f) => s + f.monthlyGMVCents, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">
                      {formatKES(sortedFranchisees.reduce((s, f) => s + f.feeCents, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                      {formatKES(sortedFranchisees.reduce((s, f) => s + f.royaltyCents, 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sortedFranchisees.reduce((s, f) => s + f.storeCount, 0)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {dashLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                      Total Franchisees
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {dashData?.totalFranchisees ?? 0}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                      Combined GMV (MTD)
                    </span>
                  </div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatKES(dashData?.totalGMVCents ?? 0)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {dashData?.totalSales ?? 0} transactions
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                      Total Fees Due
                    </span>
                  </div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                    {formatKES(dashData?.totalFeeCents ?? 0)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                      Royalties Due
                    </span>
                  </div>
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">
                    {formatKES(dashData?.totalRoyaltyCents ?? 0)}
                  </div>
                </div>
              </div>

              {/* Performance ranking */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-500" />
                    Franchisee Performance Ranking (This Month)
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={loadDashboard}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                    <button
                      onClick={exportCSV}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      <Download className="w-3 h-3" /> Export CSV
                    </button>
                  </div>
                </div>

                {!dashData || dashData.franchiseePerformance.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No franchisee data available</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {dashData.franchiseePerformance.map((f, idx) => {
                      const isAboveAvg = (f.performanceRatio ?? 0) >= 0.8;
                      const pct =
                        dashData.totalGMVCents > 0
                          ? (f.monthlyGMVCents / dashData.totalGMVCents) * 100
                          : 0;
                      return (
                        <div
                          key={f.id}
                          className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">
                                #{idx + 1}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white text-sm">
                                {f.name}
                              </span>
                              {isAboveAvg ? (
                                <span className="text-xs flex items-center gap-0.5 text-green-600 dark:text-green-400">
                                  <CheckCircle className="w-3 h-3" /> Above avg
                                </span>
                              ) : (
                                <span className="text-xs flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                                  <XCircle className="w-3 h-3" /> Below avg
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                {formatKES(f.monthlyGMVCents)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {f.salesCount} sales
                              </div>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${
                                isAboveAvg
                                  ? 'bg-green-500 dark:bg-green-400'
                                  : 'bg-amber-400 dark:bg-amber-500'
                              }`}
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <span>Fee due: {formatKES(f.feeCents)}</span>
                            <span>Royalty: {formatKES(f.royaltyCents)}</span>
                            <span>{pct.toFixed(1)}% of network GMV</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {dashData && dashData.totalFranchisees > 0 && (
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                    <span>
                      Network average GMV: <strong>{formatKES(dashData.avgGMVCents)}</strong>
                    </span>
                    <span>
                      Total combined: <strong>{formatKES(dashData.totalGMVCents)}</strong>
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="max-w-lg space-y-6">
          {settingsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <>
              {settings?.parentBusiness ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Linked to franchisor: <strong>{settings.parentBusiness.name}</strong>
                  </p>
                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                    ID: {settings.parentBusiness.id}
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Not linked to a parent franchisor
                  </p>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-5">
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                    Default Franchise Fee
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Applied when linking new franchisees unless overridden
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settingsFee}
                      onChange={(e) => setSettingsFee(e.target.value)}
                      className="w-36 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">%</span>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                    Default Royalty Rate
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Percentage of franchisee GMV collected as royalty
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settingsRoyalty}
                      onChange={(e) => setSettingsRoyalty(e.target.value)}
                      className="w-36 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">%</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSaveSettings}
                    disabled={settingsSaving}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {settingsSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Settings'
                    )}
                  </button>
                  {settingsSaved && (
                    <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle className="w-4 h-4" /> Saved!
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300">
                <strong>How fees work:</strong> Franchise Fee and Royalty Rate are calculated as a
                percentage of each franchisee's monthly GMV (Gross Merchandise Value). These figures
                are shown in the Network and Dashboard tabs for collection tracking.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
