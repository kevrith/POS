/**
 * Build identity, inlined at build time.
 *
 * Every app reported "1.0.0" with versionCode 1, so there was no way to look at a
 * phone and tell which build it was running — which is exactly how a fixed bug can
 * look unfixed for days. EXPO_PUBLIC_* variables are substituted into the bundle by
 * Expo at build time; CI sets these from the commit being built.
 */
import appJson from '../app.json';

export const BUILD_SHA = (process.env.EXPO_PUBLIC_BUILD_SHA ?? "dev").slice(0, 7);
export const BUILD_TIME = process.env.EXPO_PUBLIC_BUILD_TIME ?? "";
// Read from app.json rather than repeated here — a hardcoded copy silently drifts
// the moment the real version is bumped, which is exactly the confusion this file
// exists to prevent.
export const APP_VERSION: string = (appJson as { expo: { version: string } }).expo.version;

/** e.g. "1.0.0 (a4762d3 · 14 Aug 08:41)" — or "1.0.0 (dev)" for a local run. */
export function buildLabel(): string {
  if (BUILD_SHA === "dev") return `${APP_VERSION} (dev)`;
  const when = BUILD_TIME
    ? new Date(BUILD_TIME).toLocaleString("en-KE", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";
  return when ? `${APP_VERSION} (${BUILD_SHA} · ${when})` : `${APP_VERSION} (${BUILD_SHA})`;
}

