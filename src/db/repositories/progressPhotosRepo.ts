import { asc, gte } from 'drizzle-orm';
import { progressPhotos } from '../schema';
import type { Db } from '../types';

// Progress photos (R181, free, phone only): one `progress_photos` row per photo (0008), holding the file name only. The
// file lives in the documents folder's `progress-photos/` and is resolved each time. Phase 6 Task 1 adds this one read;
// Task 12 adds the rest.

/** The local dates of photo rows on or after `from` (`YYYY-MM-DD`), oldest first, one entry per row. */
export function progressPhotoDatesSince(db: Db, from: string): string[] {
  return db
    .select({ localDate: progressPhotos.localDate })
    .from(progressPhotos)
    .where(gte(progressPhotos.localDate, from))
    .orderBy(asc(progressPhotos.localDate), asc(progressPhotos.takenAt), asc(progressPhotos.id))
    .all()
    .map((r) => r.localDate);
}
