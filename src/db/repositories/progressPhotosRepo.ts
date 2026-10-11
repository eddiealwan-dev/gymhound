import { asc, gte } from 'drizzle-orm';
import { progressPhotos } from '../schema';
import type { Db } from '../types';

// Progress photos (R181, free, phone only): one `progress_photos` row per photo (0008), holding the file name only. The
// file lives in the documents folder's `progress-photos/` and is resolved each time. Phase 6 Task 1 adds this one read;
// Task 12 adds the rest.

/**
 * The date and file name of each photo row on or after `from` (`YYYY-MM-DD`), oldest first. The file name is there so a
 * caller can drop a row whose file is gone (a restored snapshot): such a row is never shown or counted (R181).
 */
export function progressPhotosSince(db: Db, from: string): { localDate: string; fileName: string }[] {
  return db
    .select({ localDate: progressPhotos.localDate, fileName: progressPhotos.fileName })
    .from(progressPhotos)
    .where(gte(progressPhotos.localDate, from))
    .orderBy(asc(progressPhotos.localDate), asc(progressPhotos.takenAt), asc(progressPhotos.id))
    .all();
}
