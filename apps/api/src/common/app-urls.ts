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
