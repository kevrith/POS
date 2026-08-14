/**
 * Build identity, inlined at build time.
 *
 * Every app reported "1.0.0" with versionCode 1, so there was no way to look at a
 * phone and tell which build it was running — which is exactly how a fixed bug can
 * look unfixed for days. EXPO_PUBLIC_* variables are substituted into the bundle by
 * Expo at build time; CI sets these from the commit being built.
 */
export const BUILD_SHA = (process.env.EXPO_PUBLIC_BUILD_SHA ?? "dev").slice(0, 7);
export const BUILD_TIME = process.env.EXPO_PUBLIC_BUILD_TIME ?? "";
export const APP_VERSION = "1.0.0";

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

