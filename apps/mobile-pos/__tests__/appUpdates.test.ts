import { checkForAppUpdate, updateErrorMessage, UpdatesApi } from '../lib/appUpdates';

const api = (over: Partial<UpdatesApi> = {}): UpdatesApi => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: true })),
  ...over,
});

describe('checkForAppUpdate', () => {
  it('says unsupported in a development build, without calling the server', async () => {
    const a = api({ isEnabled: false });
    expect(await checkForAppUpdate(a)).toEqual({ kind: 'unsupported' });
    expect(a.checkForUpdateAsync).not.toHaveBeenCalled();
  });
  it('is up to date when nothing new exists, and does not download', async () => {
    const a = api({ checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })) });
    expect(await checkForAppUpdate(a)).toEqual({ kind: 'up-to-date' });
    expect(a.fetchUpdateAsync).not.toHaveBeenCalled();
  });
  it('downloads when an update exists', async () => {
    expect(await checkForAppUpdate(api())).toEqual({ kind: 'downloaded' });
  });
  it('treats a fetch that brought nothing new as up to date', async () => {
    expect(await checkForAppUpdate(api({ fetchUpdateAsync: jest.fn(async () => ({ isNew: false })) }))).toEqual({ kind: 'up-to-date' });
  });
  it('lets network errors through for the caller to show', async () => {
    await expect(checkForAppUpdate(api({ checkForUpdateAsync: jest.fn(async () => { throw new Error('Network request failed'); }) }))).rejects.toThrow();
  });
});

describe('updateErrorMessage', () => {
  it('translates network failures and keeps other messages', () => {
    expect(updateErrorMessage(new Error('Network request failed'))).toMatch(/internet connection/);
    expect(updateErrorMessage(new Error('Something else'))).toBe('Something else');
    expect(updateErrorMessage(undefined)).toBe('Could not check for updates.');
  });
});
