import { EXERCISE_PHOTOS } from './exercisePhotos.generated';
import { SEED_EXERCISES } from './exercises';
import { LIBRARY_EXERCISES } from './library.generated';
import { buildLibrary } from './libraryMapping';
import type { FedbExercise } from './libraryMapping';

// The generated files are written only by scripts/build-library.mjs; these checks fail if they go stale or are edited.
const FEDB: FedbExercise[] = require('../../scripts/vendor/free-exercise-db/exercises.json');

describe('the generated library', () => {
  it('is exactly what the mapping builds from the vendored free-exercise-db', () => {
    expect(LIBRARY_EXERCISES).toEqual(buildLibrary(FEDB, SEED_EXERCISES));
  });

  it('has a start and an end photo for every exercise whose source has them, and for no other', () => {
    const sources = new Map(FEDB.map((e) => [e.id, e]));
    const withPhotos = LIBRARY_EXERCISES.filter((e) => e.sourceId !== null && sources.get(e.sourceId)!.images.length >= 2)
      .map((e) => e.id)
      .sort();
    expect(Object.keys(EXERCISE_PHOTOS).sort()).toEqual(withPhotos);
    for (const [start, end] of Object.values(EXERCISE_PHOTOS)) {
      expect(start).toBeTruthy();
      expect(end).toBeTruthy();
    }
  });

  it('keeps the photos of the existing exercises under their own ids', () => {
    expect(EXERCISE_PHOTOS['barbell-bench-press']).toBeDefined();
    expect(EXERCISE_PHOTOS['fedb-barbell-bench-press-medium-grip']).toBeUndefined();
    expect(EXERCISE_PHOTOS['wall-sit']).toBeUndefined();
  });
});

describe('the library id list', () => {
  // src/seed/libraryIds.json holds every id the library has ever had; history, notes and rest times are keyed by them.
  const LISTED: string[] = require('./libraryIds.json');

  it('never loses an id, so updating the vendored free-exercise-db cannot orphan a logged exercise', () => {
    const ids = new Set(LIBRARY_EXERCISES.map((e) => e.id));
    expect(LISTED.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('lists every id the library has, each once', () => {
    expect(new Set(LISTED).size).toBe(LISTED.length);
    expect(LIBRARY_EXERCISES.map((e) => e.id).filter((id) => !LISTED.includes(id))).toEqual([]);
  });
});
