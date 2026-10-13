/** @jest-environment node */
import { progressPhotos } from '../schema';
import { createTestDb } from '../testing/createTestDb';
import { addProgressPhoto, deleteProgressPhoto, getProgressPhoto, listProgressPhotos, progressPhotosSince } from './progressPhotosRepo';

describe('progressPhotosSince (R162, R180, R181)', () => {
  it('gives the date and file name of each photo row on or after the date, oldest first, so a caller can drop a missing file', () => {
    const { db, close } = createTestDb();
    db.insert(progressPhotos)
      .values([
        { id: 'a', localDate: '2026-10-04', takenAt: 1, fileName: 'progress-1.jpg' },
        { id: 'b', localDate: '2026-10-05', takenAt: 3, fileName: 'progress-3.jpg' },
        { id: 'c', localDate: '2026-10-11', takenAt: 5, fileName: 'progress-5.jpg' },
        { id: 'd', localDate: '2026-10-05', takenAt: 2, fileName: 'progress-2.jpg' },
      ])
      .run();
    expect(progressPhotosSince(db, '2026-10-05')).toEqual([
      { localDate: '2026-10-05', fileName: 'progress-2.jpg' },
      { localDate: '2026-10-05', fileName: 'progress-3.jpg' },
      { localDate: '2026-10-11', fileName: 'progress-5.jpg' },
    ]);
    expect(progressPhotosSince(db, '2026-10-12')).toEqual([]);
    close();
  });
});

describe('progress photo rows (R181)', () => {
  const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0).getTime();

  it('adds a row holding the file name, dated the day it was taken, and gives its id', () => {
    const { db, close } = createTestDb();
    const now = at(2026, 10, 11, 23);
    const id = addProgressPhoto(db, `progress-${now}.jpg`, now);
    expect(getProgressPhoto(db, id)).toEqual({ id, localDate: '2026-10-11', takenAt: now, fileName: `progress-${now}.jpg` });
    expect(getProgressPhoto(db, 'nope')).toBeNull();
    close();
  });

  it('lists newest first: by day, then by the time taken', () => {
    const { db, close } = createTestDb();
    const a = addProgressPhoto(db, 'progress-a.jpg', at(2026, 9, 1));
    const c = addProgressPhoto(db, 'progress-c.jpg', at(2026, 10, 11, 8));
    const d = addProgressPhoto(db, 'progress-d.jpg', at(2026, 10, 11, 20));
    const b = addProgressPhoto(db, 'progress-b.jpg', at(2026, 10, 2));
    expect(listProgressPhotos(db).map((p) => p.id)).toEqual([d, c, b, a]);
    close();
  });

  it('refuses a path or a URI: only a file name is stored', () => {
    const { db, close } = createTestDb();
    for (const bad of ['', '..', 'progress-photos/progress-1.jpg', 'file:///documents/progress-1.jpg', 'C:x.jpg']) {
      expect(() => addProgressPhoto(db, bad, at(2026, 10, 11))).toThrow();
    }
    expect(listProgressPhotos(db)).toEqual([]);
    close();
  });

  it('deletes a row and gives its file name to delete; an unknown id gives null', () => {
    const { db, close } = createTestDb();
    const keep = addProgressPhoto(db, 'progress-1.jpg', at(2026, 10, 1));
    const gone = addProgressPhoto(db, 'progress-2.jpg', at(2026, 10, 2));
    expect(deleteProgressPhoto(db, gone)).toBe('progress-2.jpg');
    expect(deleteProgressPhoto(db, gone)).toBeNull();
    expect(listProgressPhotos(db).map((p) => p.id)).toEqual([keep]);
    close();
  });
});
