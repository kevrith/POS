import { BackupInfo, backupFileName, backupsToDelete, parseBackupName } from '../src/backup';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);
const mk = (date: Date, reason = 'auto'): BackupInfo => {
  const name = backupFileName(date, reason as never);
  return { file: `/b/${name}`, name, bytes: 1000, createdAt: date, reason };
};
const newestFirst = (list: BackupInfo[]) => [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

describe('backup file names', () => {
  it('round-trips', () => {
    const d = new Date(2026, 10, 6, 10, 30, 15);
    const name = backupFileName(d, 'pre-upgrade');
    expect(name).toBe('KASTRA-2026-11-06_103015-pre-upgrade.kbk');
    expect(parseBackupName(name)).toEqual({ createdAt: d, reason: 'pre-upgrade' });
  });
  it('ignores files that are not ours', () => {
    expect(parseBackupName('holiday.jpg')).toBeNull();
    expect(parseBackupName('KASTRA-2026-11-06_103015-auto.kbk.part')).toBeNull(); // half-written
  });
});

describe('what to keep', () => {
  const now = at(2026, 11, 6, 12);

  it('keeps everything from the last week', () => {
    const list = newestFirst(Array.from({ length: 7 }, (_, i) => mk(at(2026, 11, 6 - i, 8 + i % 3))));
    expect(backupsToDelete(list, now)).toHaveLength(0);
  });

  it('thins a busy day older than a week down to one backup', () => {
    const day = [mk(at(2026, 10, 20, 9)), mk(at(2026, 10, 20, 13)), mk(at(2026, 10, 20, 17))];
    const doomed = backupsToDelete(newestFirst([mk(at(2026, 11, 6)), mk(at(2026, 11, 5)), mk(at(2026, 11, 4)), ...day]), now);
    expect(doomed).toHaveLength(2);
    expect(doomed.map((b) => b.createdAt.getHours()).sort()).toEqual([13, 17]); // the earliest of the day is kept
  });

  it('keeps one per month beyond a month, and drops things over a year old', () => {
    const list = newestFirst([
      mk(at(2026, 11, 6)), mk(at(2026, 11, 5)), mk(at(2026, 11, 4)),
      mk(at(2026, 8, 3)), mk(at(2026, 8, 20)),
      mk(at(2025, 6, 1)),
    ]);
    const doomed = backupsToDelete(list, now).map((b) => b.name);
    expect(doomed).toContain(backupFileName(at(2026, 8, 20), 'auto'));
    expect(doomed).toContain(backupFileName(at(2025, 6, 1), 'auto'));
    expect(doomed).not.toContain(backupFileName(at(2026, 8, 3), 'auto'));
  });

  it('keeps upgrade and restore safety copies for 90 days', () => {
    const safety = mk(at(2026, 9, 20), 'pre-upgrade');
    const list = newestFirst([mk(at(2026, 11, 6)), mk(at(2026, 11, 5)), mk(at(2026, 11, 4)), safety]);
    expect(backupsToDelete(list, now)).toHaveLength(0);
  });

  it('never deletes the newest three, however old', () => {
    const list = newestFirst([mk(at(2024, 1, 1)), mk(at(2024, 1, 2)), mk(at(2024, 1, 3))]);
    expect(backupsToDelete(list, now)).toHaveLength(0);
  });
});
