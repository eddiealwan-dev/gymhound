import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { LIBRARY_EXERCISES } from '../seed/library.generated';
import { exercisePhotos } from './exercisePhotos';

describe('exercisePhotos', () => {
  it('gives an exercise its start and end photos, for the picker thumbnail and the form demo (§18.8)', () => {
    expect(exercisePhotos('barbell-bench-press')).toBe(EXERCISE_PHOTOS['barbell-bench-press']);
    expect(exercisePhotos('barbell-bench-press')).toHaveLength(2);
  });

  it('gives none to the few library exercises without photos, and to a custom exercise', () => {
    expect(exercisePhotos('wall-sit')).toBeUndefined();
    expect(exercisePhotos('fedb-kettlebell-halo')).toBeUndefined();
    expect(exercisePhotos('custom-1')).toBeUndefined();
  });

  it('gives none to an id that names something every object has', () => {
    expect(exercisePhotos('constructor')).toBeUndefined();
    expect(exercisePhotos('__proto__')).toBeUndefined();
    expect(exercisePhotos('toString')).toBeUndefined();
  });

  it('finds photos for exactly the library exercises that have them', () => {
    const withPhotos = LIBRARY_EXERCISES.filter((e) => exercisePhotos(e.id) !== undefined).map((e) => e.id);
    expect(withPhotos.sort()).toEqual(Object.keys(EXERCISE_PHOTOS).sort());
  });
});
