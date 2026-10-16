import { useMemo } from 'react';
import { Platform } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useDb } from '../db/DbProvider';
import { getOwnPhotos } from '../db/repositories/exercisePhotosRepo';
import { photoFileExists, photoUri } from '../platform/exercisePhotoFiles';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { PHOTO_ALIAS } from '../seed/newExerciseData';
import { WEB_PHOTO_ALIASES, WEB_PHOTOS } from '../seed/webPhotos.generated';
import { useDataVersion } from '../state/dataVersion';

const has = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

/**
 * An exercise's bundled photos: the free-exercise-db start and end pair, or one Wikimedia Commons photo with null after
 * it (Round 16c: the programs' new exercises, each with a credit); undefined when none is bundled: custom exercises, a
 * few library ones (§18.8) and the seven metcons. An exercise can show another's photos, as the still looks the same
 * (R605, `SHOWN_AS`, `WEB_PHOTO_ALIASES`).
 * Only the screens that show photos (the picker, the form demo and the exercise editor) import this, so the photo index
 * (about 1,746 requires) stays off the app's launch path; the exercises repository does not know about photos.
 */
export function exercisePhotos(id: string): readonly [ImageSourcePropType, ImageSourcePropType | null] | undefined {
  if (has(EXERCISE_PHOTOS, id)) return EXERCISE_PHOTOS[id];
  if (has(SHOWN_AS, id)) return EXERCISE_PHOTOS[SHOWN_AS[id].photosOf];
  if (has(PHOTO_ALIAS, id)) return EXERCISE_PHOTOS[PHOTO_ALIAS[id]];
  if (has(WEB_PHOTOS, id)) return [WEB_PHOTOS[id].photo, null];
  // One hop: an alias points at a photo of its own, never at another alias (the build checks).
  if (has(WEB_PHOTO_ALIASES, id)) return exercisePhotos(WEB_PHOTO_ALIASES[id].photosOf);
  return undefined;
}

/** A Commons photo's credit, for the line under it; null for free-exercise-db photos and everything else. */
export function photoCredit(id: string): { author: string; license: string; page: string } | null {
  const own = has(WEB_PHOTOS, id) ? id : has(WEB_PHOTO_ALIASES, id) ? WEB_PHOTO_ALIASES[id].photosOf : null;
  if (own === null || !has(WEB_PHOTOS, own)) return null;
  const { author, license, page } = WEB_PHOTOS[own];
  return { author, license, page };
}

/**
 * Library exercises with no photos of their own that show another's of the same movement, and what the demo says under
 * them (Round 8: the bodyweight sissy squat had none; free-exercise-db has only the weighted one's).
 */
const SHOWN_AS: Readonly<Record<string, { photosOf: string; note: string }>> = {
  'sissy-squat': { photosOf: 'fedb-weighted-sissy-squat', note: 'Shown with a plate held to the chest. Leave it out.' },
};

/** What the form demo says under borrowed photos, or a Commons photo that needs a word; null for the rest. */
export function photoNote(id: string): string | null {
  if (has(SHOWN_AS, id)) return SHOWN_AS[id].note;
  if (has(WEB_PHOTOS, id)) return WEB_PHOTOS[id].note;
  return has(WEB_PHOTO_ALIASES, id) ? WEB_PHOTO_ALIASES[id].note : null;
}

/**
 * Whether an exercise can have your own photos (R111): only where none are bundled, which is every custom exercise and
 * the library exercises without photos. A bundled photo is never replaced.
 *
 * If a later seed bundles photos for one of the nine library exercises that have none today, the bundled pair shows
 * instead (§18.9 R111). Own photo files are removed only when a custom exercise is deleted (R109); a library
 * exercise's own photos stay on the phone until the user removes them. If that seed comes, they can no longer be
 * removed in the app; they're deleted with the app.
 */
export function canHaveOwnPhotos(exerciseId: string): boolean {
  return exercisePhotos(exerciseId) === undefined;
}

/** Your own photo names for an exercise, with any whose file has gone (a restored snapshot) read as none. */
export function useOwnPhotoNames(exerciseId: string): { start: string | null; end: string | null } | null {
  const db = useDb();
  const allowed = Platform.OS !== 'web' && canHaveOwnPhotos(exerciseId);
  // Only a slot that can hold your own photos follows writes; a bundled one (most picker rows) never draws again for one.
  const version = useDataVersion((state) => (allowed ? state.version : 0));
  return useMemo(() => {
    if (!allowed) return null;
    const { start, end } = getOwnPhotos(db, exerciseId);
    return { start: start !== null && photoFileExists(start) ? start : null, end: end !== null && photoFileExists(end) ? end : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the trigger to read again after a write
  }, [db, exerciseId, allowed, version]);
}

/**
 * The photos to show for an exercise: the bundled pair; else your own (start, end), or the one you have with null after
 * it; else undefined. Your own are never looked for on web, where there are none (phone builds only), and re-read after
 * every write.
 */
export function useExercisePhotos(exerciseId: string): readonly [ImageSourcePropType, ImageSourcePropType | null] | undefined {
  const own = useOwnPhotoNames(exerciseId);
  return useMemo(() => {
    const bundled = exercisePhotos(exerciseId);
    if (bundled) return bundled;
    const names = [own?.start, own?.end].filter((name): name is string => typeof name === 'string');
    if (names.length === 0) return undefined;
    return [{ uri: photoUri(names[0]) }, names.length > 1 ? { uri: photoUri(names[1]) } : null] as const;
  }, [exerciseId, own]);
}
