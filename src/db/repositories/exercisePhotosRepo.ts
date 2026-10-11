import { eq } from 'drizzle-orm';
import { exercisePhotos } from '../schema';
import type { Db } from '../types';

export type PhotoSlot = 'start' | 'end';

/** An exercise's own photos, by file name: null where none is set. The file may since have gone (a restored snapshot). */
export type OwnPhotoNames = { start: string | null; end: string | null };

/**
 * True for a plain file name. The database holds names only, never a path or a URI (R111): iOS moves the app's folder
 * on update, so a stored location would break, while a name is found again in `exercise-photos/` wherever it now is.
 */
export function isPhotoFileName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !/[/\\:]/.test(name);
}

/** Your own start and end photo names for an exercise (R111). */
export function getOwnPhotos(db: Db, exerciseId: string): OwnPhotoNames {
  const row = db.select().from(exercisePhotos).where(eq(exercisePhotos.exerciseId, exerciseId)).get();
  return { start: row?.startFile ?? null, end: row?.endFile ?? null };
}

/**
 * Sets one slot to a file name, or clears it with null, and returns the name it replaced (null if none, or the same
 * name) so the caller deletes that file. The row goes once both slots are empty. Throws for a name that is a path or a
 * URI. Which exercises may have their own photos is the screens' rule (`canHaveOwnPhotos`), since only they load the
 * bundled photo index.
 */
export function setOwnPhoto(db: Db, exerciseId: string, slot: PhotoSlot, fileName: string | null, now: number): string | null {
  if (fileName !== null && !isPhotoFileName(fileName)) throw new Error(`Not a photo file name: ${fileName}`);
  return db.transaction((tx) => {
    const before = getOwnPhotos(tx, exerciseId);
    const after = { ...before, [slot]: fileName };
    if (after.start === null && after.end === null) {
      tx.delete(exercisePhotos).where(eq(exercisePhotos.exerciseId, exerciseId)).run();
    } else {
      const values = { startFile: after.start, endFile: after.end, updatedAt: now };
      tx.insert(exercisePhotos)
        .values({ exerciseId, ...values })
        .onConflictDoUpdate({ target: exercisePhotos.exerciseId, set: values })
        .run();
    }
    const replaced = before[slot];
    return replaced !== fileName ? replaced : null;
  });
}
