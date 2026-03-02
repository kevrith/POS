/**
 * Sync status indicator shown in the sidebar header.
 * Shows: Online (green) | Offline (red) | Syncing (blue) | Pending count
 */
import { useSyncStore } from '../stores/sync';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function SyncStatusBadge() {
  const { isOnline, isProcessing, pendingCount } = useSyncStore();

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
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-2 py-1">
        <WifiOff className="w-3 h-3 flex-shrink-0" />
        <span>Offline{pendingCount > 0 ? ` · ${pendingCount}` : ''}</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1">
        <RefreshCw className="w-3 h-3 flex-shrink-0" />
        <span>{pendingCount} pending</span>
      </div>
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

  if (isOnline && pendingCount === 0) return null;

  if (isOnline && pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200/70 dark:border-amber-700/50">
        <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
        {pendingCount} operation{pendingCount !== 1 ? 's' : ''} syncing in background…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-b border-red-200/70 dark:border-red-700/50">
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span>
        <strong>Offline mode</strong> — Sales will sync automatically when connection is restored
      </span>
      {pendingCount > 0 && (
        <span className="ml-auto bg-red-100 dark:bg-red-800/60 px-2 py-0.5 rounded-full text-xs font-semibold">
          {pendingCount} queued
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
