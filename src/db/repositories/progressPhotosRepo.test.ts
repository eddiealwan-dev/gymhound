/** @jest-environment node */
import { progressPhotos } from '../schema';
import { createTestDb } from '../testing/createTestDb';
import { progressPhotosSince } from './progressPhotosRepo';

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
