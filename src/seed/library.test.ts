import { EXERCISE_PHOTOS } from './exercisePhotos.generated';
import { SEED_EXERCISES } from './exercises';
import { LIBRARY_EXERCISES } from './library.generated';
import { buildLibrary, nextLibraryIds } from './libraryMapping';
import { NEW_EXERCISES } from './newExercises';
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
  // src/seed/libraryIds.json holds every id the library has ever had; history, notes and rest times are keyed by them,
  // and a routine code names a library exercise by its place in it (R472), so it only ever grows at the end.
  const LISTED: string[] = require('./libraryIds.json');
  /** Every exercise the seed bundles: the library and the programs' new exercises (§18.29, R604). */
  const BUNDLED = [...LIBRARY_EXERCISES, ...NEW_EXERCISES];
  /** How many ids the list held before §18.29. */
  const BEFORE_PROGRAMS = 883;

  it('never loses an id, so updating the vendored free-exercise-db cannot orphan a logged exercise', () => {
    const ids = new Set(BUNDLED.map((e) => e.id));
    expect(LISTED.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('lists every id the library has, each once', () => {
    expect(new Set(LISTED).size).toBe(LISTED.length);
    expect(BUNDLED.map((e) => e.id).filter((id) => !LISTED.includes(id))).toEqual([]);
  });

  it('libraryIds.json grew by 107 and lost none: the library first, as before, then the new exercises (R604)', () => {
    expect(LISTED).toHaveLength(BEFORE_PROGRAMS + 107);
    expect([...LISTED.slice(0, BEFORE_PROGRAMS)].sort()).toEqual(LIBRARY_EXERCISES.map((e) => e.id).sort());
    expect(LISTED.slice(BEFORE_PROGRAMS)).toEqual(NEW_EXERCISES.map((e) => e.id).sort());
    expect(nextLibraryIds(LISTED, BUNDLED)).toEqual(LISTED);
  });
});
