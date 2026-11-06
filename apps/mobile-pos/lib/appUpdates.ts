/**
 * "Check for updates" logic, kept free of React Native / Expo imports so it runs under plain Node in tests.
 * components/UpdateCheck.tsx hands it the real `expo-updates` module.
 *
 * Over-the-air updates carry JavaScript only. They reach phones that run the SAME app version (runtimeVersion
 * follows `expo.version`); anything that changes native code, such as a new Expo module, needs a new APK.
 */
export interface UpdatesApi {
  isEnabled: boolean;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew?: boolean }>;
}

export type UpdateOutcome =
  | { kind: 'unsupported' }   // development build / Expo Go: there is no update channel to ask
  | { kind: 'up-to-date' }
  | { kind: 'downloaded' };   // fetched, applied on the next restart

export async function checkForAppUpdate(updates: UpdatesApi): Promise<UpdateOutcome> {
  if (!updates.isEnabled) return { kind: 'unsupported' };
  const check = await updates.checkForUpdateAsync();
  if (!check.isAvailable) return { kind: 'up-to-date' };
  const fetched = await updates.fetchUpdateAsync();
  return fetched.isNew === false ? { kind: 'up-to-date' } : { kind: 'downloaded' };
}

/** A phone with no signal gets a short human message instead of "Network request failed". */
export function updateErrorMessage(e: unknown): string {
  const msg = (e as Error)?.message ?? '';
  if (/network|internet|offline|failed to download|timed out/i.test(msg)) {
    return 'Could not reach the update server. Check your internet connection and try again.';
  }
  return msg || 'Could not check for updates.';
}
