import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth';
import { startPrintBridge } from '../lib/printBridge';

/** Mounted once inside the signed-in app. Does nothing outside the desktop app. */
export default function PrintBridge() {
  const storeId = useAuthStore((s) => s.user?.storeId);
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!storeId || !userId) return undefined;
    return startPrintBridge(() => useAuthStore.getState().user?.storeId);
  }, [storeId, userId]);
  return null;
}
