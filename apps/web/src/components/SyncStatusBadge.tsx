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
      <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Syncing…</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
        <WifiOff className="w-3.5 h-3.5" />
        <span>Offline{pendingCount > 0 ? ` • ${pendingCount} pending` : ''}</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <RefreshCw className="w-3.5 h-3.5" />
        <span>{pendingCount} pending</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
      <Wifi className="w-3.5 h-3.5" />
      <span>Online</span>
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
      <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 px-4 py-2 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
        <RefreshCw className="w-4 h-4 animate-spin" />
        {pendingCount} operation{pendingCount !== 1 ? 's' : ''} syncing in background…
      </div>
    );
  }

  return (
    <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700 px-4 py-2 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
      <WifiOff className="w-4 h-4" />
      <span>
        <strong>Offline mode</strong> — Sales will sync automatically when connection is restored
      </span>
      {pendingCount > 0 && (
        <span className="ml-auto bg-red-100 dark:bg-red-800 px-2 py-0.5 rounded-full text-xs font-medium">
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
