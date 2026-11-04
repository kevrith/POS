import { DEV_ADMIN_URL, DEV_FRONTEND_URL, adminUrl, appUrl, configuredOrigins, frontendUrl } from './app-urls';

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
