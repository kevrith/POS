import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from '../RouteErrorBoundary';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://localhost:3005/src/pages/SettingsPage.tsx',
    'error loading dynamically imported module',
    'Loading chunk 42 failed.',
    'Importing a module script failed.',
    'Failed to fetch',
  ])('recognises "%s" as a page that could not be loaded', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('does not mistake an ordinary bug for a stale page', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isChunkLoadError(new Error('Invalid hook call'))).toBe(false);
  });

  it('copes with something that is not an Error', () => {
    expect(isChunkLoadError('Loading chunk 3 failed')).toBe(true);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
