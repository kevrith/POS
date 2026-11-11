import { DEV_ADMIN_URL, DEV_FRONTEND_URL, DESKTOP_APP_ORIGINS, adminUrl, appUrl, configuredOrigins, frontendUrl, isOriginAllowed } from './app-urls';

describe('app urls', () => {
  it('development falls back to the ports the apps really use', () => {
    expect(frontendUrl({})).toBe('http://localhost:3005');
    expect(adminUrl({})).toBe('http://localhost:3012');
    expect(DEV_FRONTEND_URL).toBe('http://localhost:3005');
    expect(DEV_ADMIN_URL).toBe('http://localhost:3012');
  });

  it('uses the configured address without a trailing slash, and accepts WEB_URL as an alias', () => {
    expect(frontendUrl({ FRONTEND_URL: 'https://pos.example.com/' })).toBe('https://pos.example.com');
    expect(frontendUrl({ WEB_URL: 'https://web.example.com' })).toBe('https://web.example.com');
    expect(adminUrl({ ADMIN_URL: ' https://admin.example.com// ' })).toBe('https://admin.example.com');
  });

  it('production refuses to build a link that would point at localhost', () => {
    expect(() => frontendUrl({ NODE_ENV: 'production' })).toThrow(/FRONTEND_URL is not set/);
    expect(() => adminUrl({ NODE_ENV: 'production' })).toThrow(/ADMIN_URL is not set/);
    expect(() => appUrl({ NODE_ENV: 'production' })).toThrow(/FRONTEND_URL/);
    expect(frontendUrl({ NODE_ENV: 'production', FRONTEND_URL: 'https://pos.example.com' })).toBe('https://pos.example.com');
  });

  it('password-reset links prefer APP_URL, then the web app', () => {
    expect(appUrl({ APP_URL: 'https://app.example.com/' , FRONTEND_URL: 'https://pos.example.com' })).toBe('https://app.example.com');
    expect(appUrl({ FRONTEND_URL: 'https://pos.example.com' })).toBe('https://pos.example.com');
  });

  it('CORS origins: dev gets the local apps, production only what is configured and never throws', () => {
    expect(configuredOrigins({})).toEqual(['http://localhost:3005', 'http://localhost:3012']);
    expect(configuredOrigins({ NODE_ENV: 'production' })).toEqual([]);
    expect(configuredOrigins({ NODE_ENV: 'production', FRONTEND_URL: 'https://pos.example.com/' })).toEqual(['https://pos.example.com']);
  });
});

describe('who may call the API from a browser', () => {
  const allowed = ['https://pos.example.com', 'https://admin.example.com'];

  it('lets the installed desktop app in on every system, so a desktop set to use the cloud can sign in', () => {
    for (const origin of ['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost']) {
      expect(isOriginAllowed(origin, allowed)).toBe(true);
    }
    expect(DESKTOP_APP_ORIGINS).toContain('http://tauri.localhost');
  });

  it('keeps allowing the web app, the admin console, previews and origin-less callers', () => {
    expect(isOriginAllowed('https://pos.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://admin.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://my-branch-abc.vercel.app', allowed)).toBe(true);
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });

  it('still refuses any other website, including look-alikes of the allowed ones', () => {
    for (const origin of [
      'https://evil.example', 'https://pos.example.com.evil.example', 'http://pos.example.com',
      'https://tauri.localhost.evil.example', 'http://evil.localhost', 'https://notvercel.app', 'not a url',
    ]) {
      expect(isOriginAllowed(origin, allowed)).toBe(false);
    }
  });
});
