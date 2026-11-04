/**
 * Sync status indicator shown in the sidebar header.
 * Shows: Online (green) | Offline (red) | Syncing (blue) | Pending count
 */
import { useState, type ReactNode } from 'react';
import { useSyncStore } from '../stores/sync';
import { AlertCircle, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import OfflineSalesPanel from './OfflineSalesPanel';

/** The badge is a button whenever there is something to look at: it opens the list of sales saved offline. */
function BadgeButton({ className, children, label }: { className: string; children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} className={`w-full text-left ${className}`}>
        {children}
      </button>
      {open && <OfflineSalesPanel onClose={() => setOpen(false)} />}
    </>
  );
}

export default function SyncStatusBadge() {
  const { isOnline, isProcessing, pendingCount, rejectedCount } = useSyncStore();

  // A refused sale needs a person, so it wins over every other state.
  if (rejectedCount > 0) {
    return (
      <BadgeButton label={`${rejectedCount} offline sales refused by the server, open the list`} className="flex items-center gap-1.5 text-[10px] font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-md px-2 py-1">
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
        <span>{rejectedCount} refused: review</span>
      </BadgeButton>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md px-2 py-1">
        <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0" />
        <span>Syncing…</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <BadgeButton label="Offline. Open the sales saved on this device" className="flex items-center gap-1.5 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-2 py-1">
        <WifiOff className="w-3 h-3 flex-shrink-0" />
        <span>Offline{pendingCount > 0 ? ` · ${pendingCount} saved` : ''}</span>
      </BadgeButton>
    );
  }

  if (pendingCount > 0) {
    return (
      <BadgeButton label={`${pendingCount} sales waiting to upload, open the list`} className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1">
        <RefreshCw className="w-3 h-3 flex-shrink-0" />
        <span>{pendingCount} waiting to upload</span>
      </BadgeButton>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-md px-2 py-1">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
      <span>Online</span>
      <Wifi className="w-3 h-3 flex-shrink-0" />
    </div>
  );
}

/** Compact offline banner for the top of the main content area */
export function OfflineBanner() {
  const isOnline = useSyncStore((s) => s.isOnline);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const rejectedCount = useSyncStore((s) => s.rejectedCount);

  if (rejectedCount > 0) {
    return (
      <div role="alert" className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-b border-red-200/70 dark:border-red-700/50">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          <strong>{rejectedCount} sale{rejectedCount !== 1 ? 's' : ''} made offline {rejectedCount !== 1 ? 'were' : 'was'} refused by the server.</strong>{' '}
          Open the sync badge in the sidebar to review.
        </span>
      </div>
    );
  }

  if (isOnline && pendingCount === 0) return null;

  if (isOnline && pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200/70 dark:border-amber-700/50">
        <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
        {pendingCount} sale{pendingCount !== 1 ? 's' : ''} saved offline, uploading in the background…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-b border-red-200/70 dark:border-red-700/50">
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span>
        <strong>No connection.</strong> Cash, card and M-Pesa sales are saved on this device and upload when it is back.
        Gift cards, credit sales and loyalty redemption need a connection.
      </span>
      {pendingCount > 0 && (
        <span className="ml-auto bg-red-100 dark:bg-red-800/60 px-2 py-0.5 rounded-full text-xs font-semibold">
          {pendingCount} saved
        </span>
      )}
    </div>
  );
}

/** Small inline indicator for use in page headers */
export function SyncDot() {
  const isOnline = useSyncStore((s) => s.isOnline);

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'
      }`}
      title={isOnline ? 'Online' : 'Offline'}
    />
  );
}
