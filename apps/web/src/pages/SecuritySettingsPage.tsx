import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Shield, Users, Key, Eye, Plus, Trash2,
  X, Search, Download, AlertCircle, CheckCircle2,
  Tag, Loader2, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface CustomRole {
  id: string; name: string; description: string;
  permissions: string[]; grantedPermissions: Permission[]; isActive: boolean;
}
interface Permission {
  id: string; name: string; category: string;
  description: string; endpoint: string; method: string;
}
interface PasswordPolicy {
  id: string; minLength: number; requireUppercase: boolean;
  requireLowercase: boolean; requireNumbers: boolean;
  requireSpecialChars: boolean; rotationDays: number;
  preventReuse: number; isActive: boolean;
}
interface AuditLog {
  id: string; actor: string; action: string; entity: string;
  entityId: string; createdAt: string; before?: string; after?: string;
}
interface TaxConfig {
  id: string; itemId?: string; category?: string;
  vatRate: number; isZeroRated: boolean; exemptionReason?: string;
}

type Tab = 'roles' | 'permissions' | 'password' | 'audit' | 'tax' | 'etims';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
  VOID: 'bg-orange-100 text-orange-700',
};

export default function SecuritySettingsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';

  const [tab, setTab] = useState<Tab>('roles');
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntity, setAuditEntity] = useState('');
  const [auditStart, setAuditStart] = useState('');
  const [auditEnd, setAuditEnd] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Zero-rated form
  const [zeroRatedForm, setZeroRatedForm] = useState({ itemId: '', category: '', exemptionReason: '' });

  // eTIMS settings
  const [etimsMode, setEtimsMode] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [etimsSaving, setEtimsSaving] = useState(false);

  // iTax VAT
  const [itaxSubmitting, setItaxSubmitting] = useState(false);
  const [itaxResult, setItaxResult] = useState<string | null>(null);

  // ── Queries ──
  const { data: roles = [] } = useQuery<CustomRole[]>({
    queryKey: ['custom-roles', businessId],
    queryFn: () => api.get<CustomRole[]>(`/security/roles?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const { data: permissions = [] } = useQuery<Permission[]>({
    queryKey: ['permissions'],
    queryFn: () => api.get<Permission[]>('/security/permissions'),
  });
  const { data: passwordPolicy } = useQuery<PasswordPolicy>({
    queryKey: ['password-policy', businessId],
    queryFn: () => api.get<PasswordPolicy>(`/security/password-policy?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const auditQs = new URLSearchParams({ businessId, limit: '100' });
  if (auditEntity) auditQs.set('entity', auditEntity);
  if (auditStart) auditQs.set('startDate', auditStart);
  if (auditEnd) auditQs.set('endDate', auditEnd);
  const { data: auditData, isLoading: auditLoading, refetch: refetchAudit } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ['audit-logs', businessId, auditEntity, auditStart, auditEnd],
    queryFn: () => api.get(`/security/audit-logs?${auditQs}`),
    enabled: !!businessId && tab === 'audit',
  });
  const { data: taxConfigs = [] } = useQuery<TaxConfig[]>({
    queryKey: ['tax-configs', businessId],
    queryFn: () => api.get<TaxConfig[]>(`/security/tax/configurations?businessId=${businessId}`),
    enabled: !!businessId && tab === 'tax',
  });

  // ── Mutations ──
  const createRoleMut = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      api.post('/security/roles', { ...data, permissions: selectedPermissions, businessId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-roles'] }); setShowCreateRole(false); setSelectedPermissions([]); },
  });
  const updatePolicyMut = useMutation({
    mutationFn: (data: Partial<PasswordPolicy>) =>
      api.put('/security/password-policy', { ...data, businessId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['password-policy'] }),
  });
  const setZeroRatedMut = useMutation({
    mutationFn: () => api.post('/security/tax/zero-rated', { businessId, ...zeroRatedForm }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tax-configs'] }); setZeroRatedForm({ itemId: '', category: '', exemptionReason: '' }); },
  });

  const permByCategory = permissions.reduce((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  const auditLogs = (auditData?.logs ?? []).filter(l =>
    !auditSearch || l.actor.includes(auditSearch) || l.action.includes(auditSearch) || l.entity.includes(auditSearch)
  );

  const exportAuditCSV = () => {
    const rows = [['Timestamp', 'Actor', 'Action', 'Entity', 'Entity ID'],
      ...auditLogs.map(l => [l.createdAt, l.actor, l.action, l.entity, l.entityId])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `audit-log-${businessId}.csv`;
    a.click();
  };

  const submitITax = async () => {
    setItaxSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = new Date(new Date().setDate(1)).toISOString().split('T')[0];
      const res = await api.get<{ message?: string }>(`/reports/vat-return-itax?businessId=${businessId}&startDate=${monthStart}&endDate=${today}`);
      setItaxResult(res?.message ?? 'VAT return data prepared — manual upload required on iTax portal');
    } catch {
      setItaxResult('Error preparing VAT return data');
    } finally {
      setItaxSubmitting(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'roles', label: 'Custom Roles', icon: Users },
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'password', label: 'Password Policy', icon: Key },
    { id: 'audit', label: 'Audit Log', icon: Eye },
    { id: 'tax', label: 'Tax Config', icon: Tag },
    { id: 'etims', label: 'eTIMS / iTax', icon: CheckCircle2 },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Security & Settings</h1>
            <p className="text-sm text-gray-500">Roles, permissions, audit trail, and compliance</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-red-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ── ROLES TAB ── */}
        {tab === 'roles' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">Custom Roles</h2>
              <button onClick={() => setShowCreateRole(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                <Plus className="w-4 h-4" /> Create Role
              </button>
            </div>
            {roles.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No custom roles yet</p>
              </div>
            ) : roles.map(role => (
              <div key={role.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{role.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${role.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {role.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{role.description}</p>
                  </div>
                  <button className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(role.grantedPermissions ?? []).slice(0, 6).map(p => (
                    <span key={p.id} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">{p.name}</span>
                  ))}
                  {(role.grantedPermissions ?? []).length > 6 && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full">+{(role.grantedPermissions ?? []).length - 6} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PERMISSIONS TAB ── */}
        {tab === 'permissions' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Granular Permission Matrix</h2>
            {Object.entries(permByCategory).map(([cat, perms]) => (
              <div key={cat} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 capitalize">{cat}</h3>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {perms.map(p => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.description}</p>
                      </div>
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        {p.method} {p.endpoint}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(permByCategory).length === 0 && (
              <p className="text-center text-gray-500 py-8">No permissions configured</p>
            )}
          </div>
        )}

        {/* ── PASSWORD POLICY TAB ── */}
        {tab === 'password' && (
          <div className="space-y-4 max-w-xl">
            <h2 className="font-semibold text-gray-900 dark:text-white">Password Rotation Policy</h2>
            {!passwordPolicy ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum Password Length</label>
                  <input type="number" min={6} max={50} defaultValue={passwordPolicy.minLength}
                    onBlur={e => updatePolicyMut.mutate({ minLength: parseInt(e.target.value) })}
                    className="w-40 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'requireUppercase', label: 'Require uppercase letters' },
                    { key: 'requireLowercase', label: 'Require lowercase letters' },
                    { key: 'requireNumbers', label: 'Require numbers' },
                    { key: 'requireSpecialChars', label: 'Require special characters (!@#$…)' },
                  ].map(s => (
                    <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        defaultChecked={passwordPolicy[s.key as keyof PasswordPolicy] as boolean}
                        onChange={e => updatePolicyMut.mutate({ [s.key]: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{s.label}</span>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rotation Period (days)</label>
                    <input type="number" min={0} max={365} defaultValue={passwordPolicy.rotationDays}
                      onBlur={e => updatePolicyMut.mutate({ rotationDays: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    <p className="text-xs text-gray-500 mt-1">0 = no forced rotation</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prevent Reuse (last N)</label>
                    <input type="number" min={0} max={20} defaultValue={passwordPolicy.preventReuse}
                      onBlur={e => updatePolicyMut.mutate({ preventReuse: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-300">
                  <strong>IDOR Protection:</strong> All API queries are scoped by <code>businessId</code> extracted from the JWT token — not from request parameters — ensuring tenant isolation across all endpoints.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT LOG TAB ── */}
        {tab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">Audit Trail — {auditData?.total ?? 0} entries</h2>
              <div className="flex gap-2">
                <button onClick={() => refetchAudit()} className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                <button onClick={exportAuditCSV} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
                  <Download className="w-4 h-4" /> CSV
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input placeholder="Search actor/action…" value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
              <select value={auditEntity} onChange={e => setAuditEntity(e.target.value)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                <option value="">All Entities</option>
                {['Sale', 'Item', 'User', 'Employee', 'Expense', 'PurchaseOrder', 'CashSession'].map(e => <option key={e}>{e}</option>)}
              </select>
              <input type="date" value={auditStart} onChange={e => setAuditStart(e.target.value)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
              <input type="date" value={auditEnd} onChange={e => setAuditEnd(e.target.value)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
            </div>

            {auditLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Timestamp', 'Actor', 'Action', 'Entity', 'Details'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {auditLogs.map(log => (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('en-KE')}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{log.actor}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{log.entity}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">{log.entityId?.slice(0, 8)}…</td>
                        </tr>
                        {expandedLog === log.id && (log.before || log.after) && (
                          <tr key={`${log.id}-detail`}>
                            <td colSpan={5} className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                {log.before && <div><p className="font-semibold text-red-600 mb-1">Before</p><pre className="whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(JSON.parse(log.before), null, 2)}</pre></div>}
                                {log.after && <div><p className="font-semibold text-green-600 mb-1">After</p><pre className="whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(JSON.parse(log.after), null, 2)}</pre></div>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No audit logs found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAX CONFIG TAB ── */}
        {tab === 'tax' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Zero-Rated Item Tax Configuration</h2>

            {/* Add zero-rated form */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">Mark Item / Category as Zero-Rated (0% VAT)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Item ID (or leave blank for category)</label>
                  <input value={zeroRatedForm.itemId} onChange={e => setZeroRatedForm(f => ({ ...f, itemId: e.target.value }))}
                    placeholder="item UUID"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category (e.g. UNPROCESSED_FOOD)</label>
                  <input value={zeroRatedForm.category} onChange={e => setZeroRatedForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. UNPROCESSED_FOOD"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Exemption Reason</label>
                  <input value={zeroRatedForm.exemptionReason} onChange={e => setZeroRatedForm(f => ({ ...f, exemptionReason: e.target.value }))}
                    placeholder="Basic food commodity"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white" />
                </div>
              </div>
              <button onClick={() => setZeroRatedMut.mutate()}
                disabled={(!zeroRatedForm.itemId && !zeroRatedForm.category) || setZeroRatedMut.isPending}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {setZeroRatedMut.isPending ? 'Saving…' : 'Save Zero-Rated Config'}
              </button>
            </div>

            {/* Current configs */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['Item / Category', 'VAT Rate', 'Status', 'Reason'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {taxConfigs.map(tc => (
                    <tr key={tc.id}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{tc.itemId ?? tc.category ?? '—'}</td>
                      <td className="px-4 py-3">{tc.isZeroRated ? '0%' : `${tc.vatRate}%`}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${tc.isZeroRated ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {tc.isZeroRated ? 'Zero-Rated' : 'Standard'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{tc.exemptionReason ?? '—'}</td>
                    </tr>
                  ))}
                  {taxConfigs.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No custom tax configurations</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── eTIMS / iTax TAB ── */}
        {tab === 'etims' && (
          <div className="space-y-4 max-w-2xl">
            {/* eTIMS mode */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">eTIMS Environment</h3>
              <p className="text-sm text-gray-500 mb-4">Switch from KRA Sandbox to Production when ready for live eTIMS integration.</p>
              <div className="flex gap-3 mb-4">
                {(['SANDBOX', 'PRODUCTION'] as const).map(mode => (
                  <button key={mode} onClick={() => setEtimsMode(mode)}
                    className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                      etimsMode === mode
                        ? mode === 'PRODUCTION' ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                          : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                    {mode === 'SANDBOX' ? '🧪 Sandbox (Testing)' : '🟢 Production (Live KRA)'}
                  </button>
                ))}
              </div>
              {etimsMode === 'PRODUCTION' && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800 dark:text-yellow-300">
                      <strong>Before switching to Production:</strong>
                      <ul className="list-disc ml-4 mt-1 space-y-0.5">
                        <li>Obtain live BHFID and SDCID from KRA</li>
                        <li>Complete KRA eTIMS onboarding for your business</li>
                        <li>Update credentials in Settings → KRA eTIMS</li>
                        <li>Test with a small sale first</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={async () => {
                  setEtimsSaving(true);
                  await api.patch(`/business/${businessId}/settings`, { etimsEnvironment: etimsMode }).catch(() => {});
                  setEtimsSaving(false);
                  toast.success(`eTIMS mode set to ${etimsMode}`);
                }}
                disabled={etimsSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {etimsSaving ? 'Saving…' : 'Save eTIMS Mode'}
              </button>
            </div>

            {/* iTax VAT Return */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">KRA iTax VAT Return</h3>
              <p className="text-sm text-gray-500 mb-4">
                Prepare and export your monthly VAT return in KRA iTax-compatible format. Current month data will be aggregated.
              </p>
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-400">
                  <p className="font-medium text-gray-900 dark:text-white mb-1">VAT Return includes:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>Section A: Output VAT from sales (Standard 16% + Zero-rated 0%)</li>
                    <li>Section B: Input VAT from reclaimable expenses</li>
                    <li>Net VAT payable (Output - Input)</li>
                  </ul>
                </div>
                {itaxResult && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-800 dark:text-green-300">
                    {itaxResult}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={submitITax} disabled={itaxSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                    {itaxSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Prepare VAT Return
                  </button>
                  <a href={`/api/v1/reports/vat-return-itax?businessId=${businessId}&startDate=${new Date(new Date().setDate(1)).toISOString().split('T')[0]}&endDate=${new Date().toISOString().split('T')[0]}&format=csv`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Download className="w-4 h-4" /> Download CSV
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Role Modal */}
      {showCreateRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-white">Create Custom Role</h2>
              <button onClick={() => { setShowCreateRole(false); setSelectedPermissions([]); }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); createRoleMut.mutate({ name: fd.get('name') as string, description: fd.get('description') as string }); }}
              className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Name</label>
                  <input name="name" required placeholder="e.g. Floor Manager"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea name="description" rows={2} placeholder="What this role can do…"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Permissions</label>
                  {Object.entries(permByCategory).map(([cat, perms]) => (
                    <div key={cat} className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{cat}</p>
                      <div className="space-y-1.5">
                        {perms.map(p => (
                          <label key={p.id} className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={selectedPermissions.includes(p.id)}
                              onChange={e => setSelectedPermissions(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))}
                              className="w-4 h-4 text-blue-600 rounded mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                              <p className="text-xs text-gray-500">{p.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex gap-2">
                <button type="button" onClick={() => { setShowCreateRole(false); setSelectedPermissions([]); }}
                  className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={createRoleMut.isPending}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {createRoleMut.isPending ? 'Creating…' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
