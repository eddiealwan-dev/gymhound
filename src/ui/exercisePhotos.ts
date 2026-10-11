import { useMemo } from 'react';
import { Platform } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useDb } from '../db/DbProvider';
import { getOwnPhotos } from '../db/repositories/exercisePhotosRepo';
import { photoFileExists, photoUri } from '../platform/exercisePhotoFiles';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { useDataVersion } from '../state/dataVersion';

/**
 * An exercise's start and end photo, or undefined when none is bundled: custom exercises and a few library ones (§18.8).
 * Only the screens that show photos (the picker, the form demo and the exercise editor) import this, so the photo index
 * (about 1,746 requires) stays off the app's launch path; the exercises repository does not know about photos.
 */
export function exercisePhotos(id: string): readonly [ImageSourcePropType, ImageSourcePropType] | undefined {
  return Object.prototype.hasOwnProperty.call(EXERCISE_PHOTOS, id) ? EXERCISE_PHOTOS[id] : undefined;
}

/**
 * Whether an exercise can have your own photos (R111): only where none are bundled, which is every custom exercise and
 * the library exercises without photos. A bundled photo is never replaced.
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
