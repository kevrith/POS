import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Trash2, X } from 'lucide-react';
import { db, type SyncQueueEntry } from '../lib/db';
import { discardEntry, processSyncQueue, retryEntry } from '../lib/syncEngine';
import { formatKES } from '@pos/shared';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';

/** One line of what the person needs to know about a sale made offline. */
function describe(entry: SyncQueueEntry, userId: string | undefined, isManager: boolean): { label: string; tone: 'wait' | 'busy' | 'done' | 'bad'; detail?: string } {
  if (entry.status === 'DONE') {
    let real = '';
    try { real = (JSON.parse(entry.resultData ?? '{}') as { receiptNumber?: string }).receiptNumber ?? ''; } catch { /* ignore */ }
    return { label: 'Uploaded', tone: 'done', detail: real ? `Real receipt number: ${real}` : undefined };
  }
  if (entry.status === 'FAILED') return { label: 'Refused by the server', tone: 'bad', detail: entry.lastError };
  if (entry.status === 'SYNCING') return { label: 'Uploading...', tone: 'busy' };
  if (entry.userId && entry.userId !== userId && !isManager) {
    return { label: 'Waiting', tone: 'wait', detail: `Uploads when ${entry.userName ?? 'the cashier who made it'} or a manager signs in.` };
  }
  return { label: 'Waiting to upload', tone: 'wait', detail: entry.lastError ? `Last try: ${entry.lastError}` : undefined };
}

const TONE: Record<string, string> = {
  wait: 'bg-amber-100 text-amber-800',
  busy: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  bad: 'bg-red-100 text-red-800',
};

/** Sales saved on this device while offline: what is waiting, what uploaded, and what the server refused. */
export default function OfflineSalesPanel({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const isOnline = useSyncStore((s) => s.isOnline);
  const isProcessing = useSyncStore((s) => s.isProcessing);
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const entries = useLiveQuery(
    // The queue is small (finished entries are purged after a week), so filtering beats a schema change.
    () => db.syncQueue.filter((e) => e.kind === 'SALE').toArray().catch(() => [] as SyncQueueEntry[]),
    [],
    [] as SyncQueueEntry[],
  );
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Sales saved offline">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 64px)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/10">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Sales saved offline</h2>
            <p className="text-xs text-gray-500 dark:text-white/50">
              {isOnline ? 'Online.' : 'No connection.'} They upload by themselves when the connection is back.
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <button
            type="button"
            disabled={isProcessing || !isOnline}
            onClick={() => { void processSyncQueue(); }}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {isProcessing ? 'Uploading...' : 'Upload now'}
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-white/50 py-6 text-center">No sales are saved on this device.</p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((e) => {
                const d = describe(e, user?.id, isManager);
                return (
                  <li key={e.id} className="p-3 rounded-lg border border-gray-200 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                          {e.summary?.provisionalNumber ?? e.offlineId.slice(0, 8)}
                          {e.summary && <span className="font-normal text-gray-500 dark:text-white/50"> &middot; {formatKES(e.summary.totalCents)}</span>}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-white/50 flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {new Date(e.createdAt).toLocaleString()} &middot; {e.userName ?? 'unknown cashier'}
                          {e.summary && ` · ${e.summary.itemCount} item${e.summary.itemCount === 1 ? '' : 's'}`}
                          {e.summary?.customerName && ` · ${e.summary.customerName}`}
                        </p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${TONE[d.tone]}`}>{d.label}</span>
                    </div>
                    {d.detail && (
                      <p className={`text-xs mt-1.5 break-words flex items-start gap-1 ${d.tone === 'bad' ? 'text-red-700' : 'text-gray-600 dark:text-white/60'}`}>
                        {d.tone === 'bad' ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> : d.tone === 'done' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> : null}
                        <span>{d.detail}</span>
                      </p>
                    )}
                    {e.status === 'FAILED' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { void retryEntry(e.id as number); }}
                          className="min-h-[44px] px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                        >
                          Retry
                        </button>
                        {isManager && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Discard this sale? It will NOT be recorded anywhere, so the money and stock must be recorded by hand. This cannot be undone.')) {
                                void discardEntry(e.id as number);
                              }
                            }}
                            className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" /> Discard
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
