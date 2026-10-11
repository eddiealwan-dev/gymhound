import { createElement } from 'react';
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';
import { getOwnPhotos } from '../db/repositories/exercisePhotosRepo';
import { photoFileExists } from '../platform/exercisePhotoFiles';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { LIBRARY_EXERCISES } from '../seed/library.generated';
import { bumpData, useDataVersion } from '../state/dataVersion';
import { canHaveOwnPhotos, exercisePhotos, useExercisePhotos } from './exercisePhotos';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/exercisePhotosRepo', () => ({ getOwnPhotos: jest.fn(() => ({ start: null, end: null })) }));
jest.mock('../platform/exercisePhotoFiles', () => ({
  photoFileExists: jest.fn(() => true),
  photoUri: (name: string) => `file:///documents/exercise-photos/${name}`,
}));

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

describe('canHaveOwnPhotos (R111)', () => {
  it('allows your own photos only where none are bundled: a custom exercise and the library ones without photos', () => {
    expect(canHaveOwnPhotos('c0ffee00-0000-4000-8000-000000000001')).toBe(true);
    expect(canHaveOwnPhotos('bodyweight-reverse-lunge')).toBe(true);
    expect(canHaveOwnPhotos('wall-sit')).toBe(true);
    expect(canHaveOwnPhotos('barbell-back-squat')).toBe(false);
  });
});

describe('useExercisePhotos', () => {
  const originalOS = Platform.OS;
  let seen: ReturnType<typeof useExercisePhotos>;
  function Probe({ id }: { id: string }) {
    seen = useExercisePhotos(id);
    return null;
  }
  const read = (id: string) => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(createElement(Probe, { id }));
    });
    return tree;
  };

  beforeEach(() => {
    jest.mocked(getOwnPhotos).mockReset().mockReturnValue({ start: null, end: null });
    jest.mocked(photoFileExists).mockReset().mockReturnValue(true);
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('gives the bundled photos, without looking for your own', () => {
    read('barbell-back-squat');
    expect(seen).toBe(EXERCISE_PHOTOS['barbell-back-squat']);
    expect(getOwnPhotos).not.toHaveBeenCalled();
  });

  it('gives your own start and end photos, resolved in the documents folder', () => {
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: 'wall-sit-end-1.jpg' });
    read('wall-sit');
    expect(getOwnPhotos).toHaveBeenCalledWith('db', 'wall-sit');
    expect(seen).toEqual([{ uri: 'file:///documents/exercise-photos/wall-sit-start-1.jpg' }, { uri: 'file:///documents/exercise-photos/wall-sit-end-1.jpg' }]);
  });

  it('gives one photo, still, when only one is set', () => {
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: null });
    read('wall-sit');
    expect(seen).toEqual([{ uri: 'file:///documents/exercise-photos/wall-sit-start-1.jpg' }, null]);

    jest.mocked(getOwnPhotos).mockReturnValue({ start: null, end: 'wall-sit-end-1.jpg' });
    read('wall-sit');
    expect(seen).toEqual([{ uri: 'file:///documents/exercise-photos/wall-sit-end-1.jpg' }, null]);
  });

  it('treats a named file that is gone as no photo (a restored snapshot names files it does not hold)', () => {
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: 'wall-sit-end-1.jpg' });
    jest.mocked(photoFileExists).mockImplementation((name) => name !== 'wall-sit-start-1.jpg');
    read('wall-sit');
    expect(seen).toEqual([{ uri: 'file:///documents/exercise-photos/wall-sit-end-1.jpg' }, null]);

    jest.mocked(photoFileExists).mockReturnValue(false);
    read('wall-sit');
    expect(seen).toBeUndefined();
  });

  it('gives none with nothing set', () => {
    read('wall-sit');
    expect(seen).toBeUndefined();
  });

  it('reads again after a write', () => {
    read('wall-sit');
    expect(seen).toBeUndefined();
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: null });
    act(() => bumpData());
    expect(seen).toEqual([{ uri: 'file:///documents/exercise-photos/wall-sit-start-1.jpg' }, null]);
  });

  it('does not draw again after a write when photos are bundled: a long picker list stays still', () => {
    let draws = 0;
    function Counted() {
      useExercisePhotos('barbell-back-squat');
      draws += 1;
      return null;
    }
    act(() => {
      create(createElement(Counted));
    });
    expect(draws).toBe(1);
    act(() => bumpData());
    expect(draws).toBe(1);
    expect(useDataVersion.getState().version).toBeGreaterThan(0);
  });

  it('never looks for your own on web: there are none there', () => {
    Platform.OS = 'web';
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: null });
    read('wall-sit');
    expect(seen).toBeUndefined();
    expect(getOwnPhotos).not.toHaveBeenCalled();
  });
});
