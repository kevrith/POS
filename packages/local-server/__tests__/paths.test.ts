import { defaultDirs, Env, validateBackupDir, validateDataDir } from '../src/paths';

const winEnv: Env = { ProgramData: 'C:\\ProgramData', USERPROFILE: 'C:\\Users\\Wanjiku' };

describe('default folders', () => {
  it('Windows: database under ProgramData, backups in Documents', () => {
    const d = defaultDirs('win32', winEnv, 'C:\\Users\\Wanjiku');
    expect(d.rootDir).toBe('C:\\ProgramData\\KASTRA');
    expect(d.pgDataDir).toBe('C:\\ProgramData\\KASTRA\\pgdata');
    expect(d.backupDir).toBe('C:\\Users\\Wanjiku\\Documents\\KASTRA Backups');
    expect(d.configFile).toBe('C:\\ProgramData\\KASTRA\\server.json');
  });
  it('falls back sensibly when the environment is bare', () => {
    expect(defaultDirs('win32', {}, 'C:\\Users\\X').rootDir).toBe('C:\\ProgramData\\KASTRA');
  });
  it('Linux (development only)', () => {
    expect(defaultDirs('linux', {}, '/home/kelvin').rootDir).toBe('/home/kelvin/.local/share/kastra');
  });
});

describe('live database folder rules (Windows)', () => {
  const ok = (p: string, env = winEnv) => validateDataDir(p, 'win32', env);
  const reason = (p: string, env = winEnv) => { const r = ok(p, env); return r.ok ? '' : r.reason; };

  it('accepts a plain local folder', () => {
    expect(ok('C:\\ProgramData\\KASTRA\\pgdata').ok).toBe(true);
    expect(ok('D:\\KastraData').ok).toBe(true);
  });
  it('refuses network shares', () => expect(reason('\\\\server\\share\\kastra')).toMatch(/network share/i));
  it('refuses a whole drive', () => {
    expect(reason('C:\\')).toMatch(/not the whole drive/i);
    expect(reason('D:')).not.toBe('');
  });
  it('refuses relative paths and empty input', () => {
    expect(reason('kastra')).toMatch(/full folder path/i);
    expect(reason('   ')).toMatch(/choose a folder/i);
  });
  it('refuses OneDrive, by environment and by name', () => {
    const env = { ...winEnv, OneDrive: 'C:\\Users\\Wanjiku\\OneDrive' };
    expect(reason('C:\\Users\\Wanjiku\\OneDrive\\Kastra', env)).toMatch(/OneDrive/);
    expect(reason('C:\\Users\\Wanjiku\\OneDrive - Acme Ltd\\Kastra')).toMatch(/synced/i);
    expect(reason('D:\\Dropbox\\Kastra')).toMatch(/synced/i);
    expect(reason('E:\\Google Drive\\Kastra')).toMatch(/synced/i);
  });
  it('refuses Documents / Desktop / Pictures, which Windows often redirects into OneDrive', () => {
    expect(reason('C:\\Users\\Wanjiku\\Documents\\Kastra')).toMatch(/Documents, Desktop/);
    expect(reason('C:\\Users\\Wanjiku\\Desktop\\Kastra')).not.toBe('');
  });
  it('refuses Program Files and Windows', () => {
    expect(reason('C:\\Program Files\\KASTRA\\data')).toMatch(/read-only/i);
    expect(reason('C:\\Windows\\Temp\\kastra')).toMatch(/read-only/i);
  });
  it('compares paths without regard to case on Windows', () => {
    expect(reason('c:\\users\\wanjiku\\onedrive\\kastra', { ...winEnv, OneDrive: 'C:\\Users\\Wanjiku\\OneDrive' })).toMatch(/OneDrive/);
  });
});

describe('backup folder rules', () => {
  const data = 'C:\\ProgramData\\KASTRA\\pgdata';
  it('allows Documents, a USB drive and even a OneDrive folder (backups are single files)', () => {
    expect(validateBackupDir('C:\\Users\\Wanjiku\\Documents\\KASTRA Backups', data, 'win32').ok).toBe(true);
    expect(validateBackupDir('E:\\KASTRA Backups', data, 'win32').ok).toBe(true);
    expect(validateBackupDir('C:\\Users\\Wanjiku\\OneDrive\\KASTRA Backups', data, 'win32').ok).toBe(true);
  });
  it('refuses a folder inside the database folder', () => {
    expect(validateBackupDir('C:\\ProgramData\\KASTRA\\pgdata\\backups', data, 'win32').ok).toBe(false);
    expect(validateBackupDir('c:\\programdata\\kastra\\PGDATA', data, 'win32').ok).toBe(false);
  });
  it('allows a sibling folder next to the database', () => {
    expect(validateBackupDir('C:\\ProgramData\\KASTRA\\backups', data, 'win32').ok).toBe(true);
  });
});
