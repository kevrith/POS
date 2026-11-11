/**
 * Where the web app and admin console live, for links in emails, payment callbacks and redirects.
 *
 * These used to be written as `process.env.FRONTEND_URL ?? 'http://localhost:3001'` in a dozen places, and the
 * fallback was the wrong port (the web app serves on 3005). Worse, in production a missing variable silently
 * produced links that point at the developer's own machine, which look fine to us and are dead to the customer.
 * Now development gets the right local defaults, and production REFUSES to build a link without the setting.
 */
export const DEV_FRONTEND_URL = 'http://localhost:3005';
export const DEV_ADMIN_URL = 'http://localhost:3012';

const strip = (url: string) => url.trim().replace(/\/+$/, '');

function required(name: string, value: string | undefined, devDefault: string, env: NodeJS.ProcessEnv): string {
  const v = value?.trim();
  if (v) return strip(v);
  if (env.NODE_ENV === 'production') {
    throw new Error(`${name} is not set. Set it to the public address of the app (for example https://pos.example.com).`);
  }
  return devDefault;
}

/** The customer-facing web app. Accepts WEB_URL as an older alias. */
export function frontendUrl(env: NodeJS.ProcessEnv = process.env): string {
  return required('FRONTEND_URL', env.FRONTEND_URL || env.WEB_URL, DEV_FRONTEND_URL, env);
}

export function adminUrl(env: NodeJS.ProcessEnv = process.env): string {
  return required('ADMIN_URL', env.ADMIN_URL, DEV_ADMIN_URL, env);
}

/** Base for links in account emails (password reset). Defaults to the web app. */
export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.APP_URL?.trim();
  return v ? strip(v) : frontendUrl(env);
}

/**
 * Origins the browser may call the API from. Unlike links, a missing value here must not stop the server:
 * production lists only what is configured (and the caller should warn when that is nothing).
 */
export function configuredOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const production = env.NODE_ENV === 'production';
  const web = (env.FRONTEND_URL || env.WEB_URL)?.trim();
  const admin = env.ADMIN_URL?.trim();
  const origins = [web ? strip(web) : production ? '' : DEV_FRONTEND_URL, admin ? strip(admin) : production ? '' : DEV_ADMIN_URL];
  return origins.filter(Boolean);
}

/**
 * Where the installed desktop app's screens come from: `http://tauri.localhost` on Windows, `tauri://localhost` on macOS
 * and Linux. A desktop app set to use the cloud calls this API from that address, so without it every sign-in fails with a
 * browser CORS error even though the server is up. Only the program's own embedded web view can be at these addresses, and
 * the app signs in with a bearer token, not a cookie, so allowing them gives a web page on the internet no access.
 */
export const DESKTOP_APP_ORIGINS = ['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'] as const;

/**
 * Whether a browser at `origin` may call the API. No origin (mobile apps, curl, health checks) is allowed, as are the
 * configured web/admin addresses, the desktop app, and any *.vercel.app preview.
 */
export function isOriginAllowed(origin: string | undefined, allowed: readonly string[]): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  if ((DESKTOP_APP_ORIGINS as readonly string[]).includes(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}
