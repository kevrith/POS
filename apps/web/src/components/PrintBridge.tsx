import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { BRIDGE_CONFIG_EVENT, getStationToken, startPrintBridge } from '../lib/printBridge';

/**
 * Mounted at the top of the app, signed in or not. A computer with a print station token delivers queued
 * prints all day without anyone logged in; otherwise it delivers while someone is signed in. Does nothing
 * outside the desktop app.
 */
export default function PrintBridge() {
  const storeId = useAuthStore((s) => s.user?.storeId);
  const userId = useAuthStore((s) => s.user?.id);
  // Bumped when Settings adds or removes this computer's station token, so the loop restarts with the new mode.
  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    const onChange = () => setConfigVersion((v) => v + 1);
    window.addEventListener(BRIDGE_CONFIG_EVENT, onChange);
    return () => window.removeEventListener(BRIDGE_CONFIG_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!getStationToken() && !(storeId && userId)) return undefined;
    return startPrintBridge(() => useAuthStore.getState().user?.storeId);
  }, [storeId, userId, configVersion]);
  return null;
}
