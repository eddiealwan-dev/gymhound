import { asc, desc, eq, gte } from 'drizzle-orm';
import { toLocalDate } from '../../domain/dates';
import { newId } from '../ids';
import { progressPhotos } from '../schema';
import type { Db } from '../types';
import { isPhotoFileName } from './exercisePhotosRepo';

// Progress photos (R181, free, phone only): one `progress_photos` row per photo (0008), holding the file name only. The
// file lives in the documents folder's `progress-photos/` and is resolved each time (`progressPhotoFiles.ts`). A row
// whose file is gone (a restored snapshot) is never shown or counted: callers drop it with `progressPhotoExists`.

/** One progress photo row: the day it was taken, when, and its file's name (never a path). */
export type ProgressPhoto = { id: string; localDate: string; takenAt: number; fileName: string };

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

/** Every progress photo row, newest first: by the day taken, then the time. Rows whose file is gone are included. */
export function listProgressPhotos(db: Db): ProgressPhoto[] {
  return db
    .select()
    .from(progressPhotos)
    .orderBy(desc(progressPhotos.localDate), desc(progressPhotos.takenAt), desc(progressPhotos.id))
    .all();
}

/** One progress photo row, or null. */
export function getProgressPhoto(db: Db, id: string): ProgressPhoto | null {
  return db.select().from(progressPhotos).where(eq(progressPhotos.id, id)).get() ?? null;
}

/**
 * Stores a photo just saved as `fileName`, taken at `now` and dated that local day, and returns its id. Throws for a
 * path or a URI: only the name is stored, since iOS moves the app's folder on update (R111, R181).
 */
export function addProgressPhoto(db: Db, fileName: string, now: number): string {
  if (!isPhotoFileName(fileName)) throw new Error(`Not a photo file name: ${fileName}`);
  const id = newId();
  db.insert(progressPhotos).values({ id, localDate: toLocalDate(now), takenAt: now, fileName }).run();
  return id;
}

/** Deletes a photo row and returns its file name, for the caller to delete the file once this has committed; null when there is no such row. */
export function deleteProgressPhoto(db: Db, id: string): string | null {
  return db.transaction((tx) => {
    const row = getProgressPhoto(tx, id);
    if (row === null) return null;
    tx.delete(progressPhotos).where(eq(progressPhotos.id, id)).run();
    return row.fileName;
  });
}
