import { CLOUD_BACKUP_FOLDER, cloudBackupLine, restoreCandidate } from './cloudBackup';

const CLOUD = 'gymhound-20261011-071500-123.db';
const LOCAL = 'gymhound-20261010-180000-000.db';

describe('restoreCandidate (R214)', () => {
  it('names the cloud copy when the live database is empty and there is no local snapshot', () => {
    expect(restoreCandidate({ liveMissingOrEmpty: true, localSnapshots: [], cloud: { name: CLOUD } })).toBe(CLOUD);
  });

  it('ignores the cloud copy when the live database has data', () => {
    expect(restoreCandidate({ liveMissingOrEmpty: false, localSnapshots: [], cloud: { name: CLOUD } })).toBeNull();
  });

  it('ignores the cloud copy when a local snapshot exists, even an older one', () => {
    expect(restoreCandidate({ liveMissingOrEmpty: true, localSnapshots: [LOCAL], cloud: { name: CLOUD } })).toBeNull();
  });

  it('is null with no cloud copy', () => {
    expect(restoreCandidate({ liveMissingOrEmpty: true, localSnapshots: [], cloud: null })).toBeNull();
  });

  it('counts only snapshot names as local snapshots (a .partial file left by a kill is not one)', () => {
    const partial = `${LOCAL}.partial`;
    expect(restoreCandidate({ liveMissingOrEmpty: true, localSnapshots: [partial], cloud: { name: CLOUD } })).toBe(CLOUD);
  });

  it('never names a cloud file that is not a snapshot name', () => {
    expect(restoreCandidate({ liveMissingOrEmpty: true, localSnapshots: [], cloud: { name: 'notes.db' } })).toBeNull();
    expect(restoreCandidate({ liveMissingOrEmpty: true, localSnapshots: [], cloud: { name: '../gymhound.db' } })).toBeNull();
  });
});

describe('cloudBackupLine (R213)', () => {
  const time = (ms: number) => `T${ms}`;

  it('iCloud: the last copy', () => {
    expect(cloudBackupLine({ kind: 'icloud', at: 1000, error: null }, time)).toBe('iCloud copy: T1000.');
  });

  it('iCloud: none yet', () => {
    expect(cloudBackupLine({ kind: 'icloud', at: null, error: null }, time)).toBe('No iCloud copy yet.');
  });

  it('iCloud: a failure newer than the last copy', () => {
    expect(cloudBackupLine({ kind: 'icloud', at: 1000, error: { at: 2000, message: 'No space.' } }, time)).toBe(
      'The iCloud copy failed at T2000: No space.',
    );
  });

  it('iCloud: a failure with no copy yet', () => {
    expect(cloudBackupLine({ kind: 'icloud', at: null, error: { at: 2000, message: 'Off.' } }, time)).toBe(
      'The iCloud copy failed at T2000: Off.',
    );
  });

  it('iCloud: a copy newer than an old failure', () => {
    expect(cloudBackupLine({ kind: 'icloud', at: 3000, error: { at: 2000, message: 'Off.' } }, time)).toBe(
      'iCloud copy: T3000.',
    );
  });

  it('Android: the last copy, with the once-a-day note', () => {
    expect(cloudBackupLine({ kind: 'android_backup', at: 1000, error: null }, time)).toBe(
      'Android backup copy: T1000. Android backs it up about once a day.',
    );
  });

  it('Android: none yet', () => {
    expect(cloudBackupLine({ kind: 'android_backup', at: null, error: null }, time)).toBe('No backup copy yet.');
  });

  it('Android: a failure newer than the last copy', () => {
    expect(cloudBackupLine({ kind: 'android_backup', at: 1000, error: { at: 2000, message: 'Disk full.' } }, time)).toBe(
      'The backup copy failed at T2000: Disk full.',
    );
  });

  it('Android: a copy newer than an old failure', () => {
    expect(cloudBackupLine({ kind: 'android_backup', at: 3000, error: { at: 2000, message: 'x' } }, time)).toBe(
      'Android backup copy: T3000. Android backs it up about once a day.',
    );
  });
});

it('the Android folder is cloud-backup', () => {
  expect(CLOUD_BACKUP_FOLDER).toBe('cloud-backup');
});
