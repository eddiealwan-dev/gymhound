import { createElement } from 'react';
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';
import { getOwnPhotos } from '../db/repositories/exercisePhotosRepo';
import { photoFileExists } from '../platform/exercisePhotoFiles';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { LIBRARY_EXERCISES } from '../seed/library.generated';
import { NEW_EXERCISES, PHOTO_ALIAS } from '../seed/newExercises';
import { bumpData, useDataVersion } from '../state/dataVersion';
import { WEB_PHOTO_ALIASES, WEB_PHOTOS } from '../seed/webPhotos.generated';
import { canHaveOwnPhotos, exercisePhotos, photoCredit, photoNote, useExercisePhotos } from './exercisePhotos';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A stand-in for the generated Commons map, so these tests read the same whatever scripts/web-photos.json holds.
jest.mock('../seed/webPhotos.generated', () => ({
  WEB_PHOTOS: {
    'front-lever': { photo: 'web-front-lever', author: 'A. Person', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', page: 'https://commons.wikimedia.org/wiki/File:X.jpg', note: null },
  },
  WEB_PHOTO_ALIASES: {
    'tuck-front-lever': { photosOf: 'front-lever', note: 'Shown at the full front lever.' },
    'ring-row': { photosOf: 'fedb-inverted-row', note: 'Shown on a bar. Rings hang the same way.' },
  },
}));

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

  it('finds photos for exactly the library exercises that have them, and the sissy squat', () => {
    const withPhotos = LIBRARY_EXERCISES.filter((e) => exercisePhotos(e.id) !== undefined).map((e) => e.id);
    expect(withPhotos.sort()).toEqual([...Object.keys(EXERCISE_PHOTOS), 'sissy-squat'].sort());
  });

  it("shows the bodyweight sissy squat the weighted one's photos, with a note (Round 8)", () => {
    expect(exercisePhotos('sissy-squat')).toBe(EXERCISE_PHOTOS['fedb-weighted-sissy-squat']);
    expect(photoNote('sissy-squat')).toBe('Shown with a plate held to the chest. Leave it out.');
    expect(photoNote('fedb-weighted-sissy-squat')).toBeNull();
    expect(photoNote('constructor')).toBeNull();
    expect(canHaveOwnPhotos('sissy-squat')).toBe(false);
  });
});

describe('PHOTO_ALIAS (§18.29, R605)', () => {
  it("shows seven of the programs' new exercises the bundled photos of one whose still looks the same, with no note", () => {
    expect(Object.keys(PHOTO_ALIAS)).toHaveLength(7);
    for (const [id, photosOf] of Object.entries(PHOTO_ALIAS)) {
      expect([id, exercisePhotos(id)]).toEqual([id, EXERCISE_PHOTOS[photosOf]]);
      expect([id, exercisePhotos(id)]).not.toEqual([id, undefined]);
      expect(photoNote(id)).toBeNull();
      expect(canHaveOwnPhotos(id)).toBe(false);
    }
    expect(exercisePhotos('paused-back-squat')).toBe(EXERCISE_PHOTOS['barbell-back-squat']);
  });

  it('gives a new exercise with no alias and no Commons photo none, so a phone build offers your own (R111)', () => {
    const without = NEW_EXERCISES.filter((e) => !(e.id in PHOTO_ALIAS) && !(e.id in WEB_PHOTOS) && !(e.id in WEB_PHOTO_ALIASES));
    expect(without.length).toBeGreaterThan(0);
    for (const e of without) expect([e.id, exercisePhotos(e.id), canHaveOwnPhotos(e.id)]).toEqual([e.id, undefined, true]);
  });
});

describe('the Commons photos (Round 16c)', () => {
  it('gives an exercise its one Commons photo with null after it, so the demo shows it still, and its credit', () => {
    expect(exercisePhotos('front-lever')).toEqual(['web-front-lever', null]);
    expect(photoCredit('front-lever')).toEqual({ author: 'A. Person', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:X.jpg' });
    expect(photoNote('front-lever')).toBeNull();
    expect(canHaveOwnPhotos('front-lever')).toBe(false);
  });

  it("shows an aliased exercise its family's photo, with the note and the same credit", () => {
    expect(exercisePhotos('tuck-front-lever')).toEqual(['web-front-lever', null]);
    expect(photoNote('tuck-front-lever')).toBe('Shown at the full front lever.');
    expect(photoCredit('tuck-front-lever')).toEqual(photoCredit('front-lever'));
    expect(canHaveOwnPhotos('tuck-front-lever')).toBe(false);
  });

  it('an alias onto a free-exercise-db exercise shows that pair, with the note and no credit', () => {
    expect(exercisePhotos('ring-row')).toBe(EXERCISE_PHOTOS['fedb-inverted-row']);
    expect(photoNote('ring-row')).toBe('Shown on a bar. Rings hang the same way.');
    expect(photoCredit('ring-row')).toBeNull();
  });

  it('gives free-exercise-db photos no credit', () => {
    expect(photoCredit('barbell-bench-press')).toBeNull();
    expect(photoCredit('sissy-squat')).toBeNull();
    expect(photoCredit('constructor')).toBeNull();
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
