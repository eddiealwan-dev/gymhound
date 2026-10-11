import type { ImageSourcePropType } from 'react-native';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';

/**
 * An exercise's start and end photo, or undefined when none is bundled: custom exercises and a few library ones (§18.8).
 * Only the screens that show photos (the picker and the form demo) import this, so the photo index (about 1,746
 * requires) stays off the app's launch path; the exercises repository does not know about photos.
 */
export function exercisePhotos(id: string): readonly [ImageSourcePropType, ImageSourcePropType] | undefined {
  return Object.prototype.hasOwnProperty.call(EXERCISE_PHOTOS, id) ? EXERCISE_PHOTOS[id] : undefined;
}
