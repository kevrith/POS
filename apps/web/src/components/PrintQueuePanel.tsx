import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, X } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { isBridgeEnabled, setBridgeEnabled } from '../lib/printBridge';
import { isDesktopApp } from '../lib/desktopPrinter';
import { cancelPrintJob, listPrintJobs, retryPrintJob, type PrintJobSummary } from '../lib/printQueue';

const STATUS_STYLE: Record<PrintJobSummary['status'], string> = {
  QUEUED: 'bg-amber-100 text-amber-800',
  SENDING: 'bg-blue-100 text-blue-800',
  SENT: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-200 text-gray-700',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

const KIND_LABEL: Record<PrintJobSummary['kind'], string> = {
  RECEIPT: 'Receipt', KOT: 'Kitchen ticket', BILL: 'Bill', DRAWER: 'Cash drawer', TEST: 'Test',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Recent prints for this store, with retry for the ones that did not reach a printer. Owner and manager only. */
export default function PrintQueuePanel() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const storeId = user?.storeId;
  const allowed = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [bridgeOn, setBridgeOn] = useState(isBridgeEnabled);
  const desktop = isDesktopApp();

  const { data: jobs = [], isFetching, error, refetch } = useQuery({
    queryKey: ['print-jobs', storeId],
    queryFn: () => listPrintJobs(storeId as string),
    enabled: allowed && !!storeId,
    refetchInterval: 10000,
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'cancel' }) => (action === 'retry' ? retryPrintJob(id) : cancelPrintJob(id)),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['print-jobs', storeId] }); },
  });

  if (!allowed || !storeId) return null;

  const shown = onlyProblems ? jobs.filter((j) => ['QUEUED', 'SENDING', 'FAILED', 'EXPIRED'].includes(j.status)) : jobs;
  const waiting = jobs.filter((j) => j.status === 'QUEUED' || j.status === 'SENDING').length;
  const failed = jobs.filter((j) => j.status === 'FAILED').length;

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Print history</h3>
          <p className="text-xs text-gray-500">
            Every receipt, kitchen ticket and drawer open for this store.
            {waiting > 0 && <span className="text-amber-700"> {waiting} waiting for a printer.</span>}
            {failed > 0 && <span className="text-red-700"> {failed} failed.</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void refetch(); }}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          aria-label="Refresh print history"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {desktop && (
        <label className="flex items-start gap-2 mb-3 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={bridgeOn}
            onChange={(e) => { setBridgeEnabled(e.target.checked); setBridgeOn(e.target.checked); }}
          />
          <span>
            <span className="font-medium">Deliver queued prints from this computer.</span>{' '}
            Use this on a till that is on the shop network, so printers the cloud cannot reach still print.
            Kitchen and receipt printers need a fixed IP address such as 192.168.1.50.
          </span>
        </label>
      )}

      <label className="inline-flex items-center gap-2 mb-2 text-sm text-gray-700">
        <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
        Only show waiting and failed
      </label>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-700 mb-2">
          <AlertCircle className="w-4 h-4" /> Could not load the print history.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">{onlyProblems ? 'Nothing is waiting or failed.' : 'Nothing has been printed yet.'}</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {shown.map((j) => (
            <li key={j.id} className="p-3 flex items-start gap-3">
              <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[j.status]}`}>{j.status}</span>
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-medium text-gray-800 truncate">
                  {KIND_LABEL[j.kind]}{j.refNumber ? ` ${j.refNumber}` : ''}
                  {j.copyNumber > 0 && <span className="ml-1.5 text-xs font-normal text-gray-500">copy {j.copyNumber}</span>}
                  {j.reason && <span className="ml-1.5 text-xs font-normal text-gray-500">{j.reason.toLowerCase()}</span>}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {timeAgo(j.createdAt)} via {j.method.toLowerCase()}
                  {j.attempts > 1 && ` after ${j.attempts} attempts`}
                </p>
                {j.lastError && j.status !== 'SENT' && <p className="text-xs text-red-700 mt-0.5 break-words">{j.lastError}</p>}
              </div>
              {(j.status === 'FAILED' || j.status === 'EXPIRED') && j.method !== 'BROWSER' && j.printerId && (
                <button
                  type="button"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ id: j.id, action: 'retry' })}
                  className="min-h-[44px] px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  Retry
                </button>
              )}
              {j.status === 'QUEUED' && (
                <button
                  type="button"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ id: j.id, action: 'cancel' })}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
                  aria-label="Cancel this print"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {j.status === 'SENT' && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-1" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
