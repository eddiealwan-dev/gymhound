/** @jest-environment node */
import { progressPhotos } from '../schema';
import { createTestDb } from '../testing/createTestDb';
import { progressPhotoDatesSince } from './progressPhotosRepo';

describe('progressPhotoDatesSince (R162, R180)', () => {
  it('gives the local dates of photo rows on or after the date, oldest first, one per row', () => {
    const { db, close } = createTestDb();
    db.insert(progressPhotos)
      .values([
        { id: 'a', localDate: '2026-10-04', takenAt: 1, fileName: 'progress-1.jpg' },
        { id: 'b', localDate: '2026-10-05', takenAt: 3, fileName: 'progress-3.jpg' },
        { id: 'c', localDate: '2026-10-11', takenAt: 5, fileName: 'progress-5.jpg' },
        { id: 'd', localDate: '2026-10-05', takenAt: 2, fileName: 'progress-2.jpg' },
      ])
      .run();
    expect(progressPhotoDatesSince(db, '2026-10-05')).toEqual(['2026-10-05', '2026-10-05', '2026-10-11']);
    expect(progressPhotoDatesSince(db, '2026-10-12')).toEqual([]);
    close();
  });
});
