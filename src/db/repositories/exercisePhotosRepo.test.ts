/** @jest-environment node */
import { exercisePhotos } from '../schema';
import { seededDb } from '../testing/fixtures';
import { getOwnPhotos, setOwnPhoto } from './exercisePhotosRepo';

const NOW = new Date(2026, 9, 11, 9, 0).getTime();

describe('exercise photos (R111)', () => {
  it('has none for an exercise never given one', () => {
    expect(getOwnPhotos(seededDb(), 'wall-sit')).toEqual({ start: null, end: null });
  });

  it('stores each slot by file name, and tells nothing was replaced the first time', () => {
    const db = seededDb();
    expect(setOwnPhoto(db, 'wall-sit', 'start', 'wall-sit-start-1.jpg', NOW)).toBeNull();
    expect(setOwnPhoto(db, 'wall-sit', 'end', 'wall-sit-end-2.jpg', NOW + 1)).toBeNull();

    expect(getOwnPhotos(db, 'wall-sit')).toEqual({ start: 'wall-sit-start-1.jpg', end: 'wall-sit-end-2.jpg' });
    expect(db.select().from(exercisePhotos).all()).toEqual([
      { exerciseId: 'wall-sit', startFile: 'wall-sit-start-1.jpg', endFile: 'wall-sit-end-2.jpg', updatedAt: NOW + 1 },
    ]);
  });

  it('returns the name it replaced, for the caller to delete that file', () => {
    const db = seededDb();
    setOwnPhoto(db, 'wall-sit', 'start', 'wall-sit-start-1.jpg', NOW);
    setOwnPhoto(db, 'wall-sit', 'end', 'wall-sit-end-1.jpg', NOW);

    expect(setOwnPhoto(db, 'wall-sit', 'start', 'wall-sit-start-2.jpg', NOW + 1)).toBe('wall-sit-start-1.jpg');
    expect(getOwnPhotos(db, 'wall-sit')).toEqual({ start: 'wall-sit-start-2.jpg', end: 'wall-sit-end-1.jpg' });
  });

  it('removes a slot with null, and the row once both are empty', () => {
    const db = seededDb();
    setOwnPhoto(db, 'wall-sit', 'start', 'a.jpg', NOW);
    setOwnPhoto(db, 'wall-sit', 'end', 'b.jpg', NOW);

    expect(setOwnPhoto(db, 'wall-sit', 'end', null, NOW + 1)).toBe('b.jpg');
    expect(getOwnPhotos(db, 'wall-sit')).toEqual({ start: 'a.jpg', end: null });
    expect(setOwnPhoto(db, 'wall-sit', 'start', null, NOW + 2)).toBe('a.jpg');
    expect(db.select().from(exercisePhotos).all()).toEqual([]);
    expect(setOwnPhoto(db, 'wall-sit', 'start', null, NOW + 3)).toBeNull();
  });

  it('does not count the same name as replaced', () => {
    const db = seededDb();
    setOwnPhoto(db, 'wall-sit', 'start', 'a.jpg', NOW);
    expect(setOwnPhoto(db, 'wall-sit', 'start', 'a.jpg', NOW + 1)).toBeNull();
  });

  it('refuses a path or a URI: the database holds file names only', () => {
    const db = seededDb();
    expect(() => setOwnPhoto(db, 'wall-sit', 'start', 'file:///var/mobile/x.jpg', NOW)).toThrow();
    expect(() => setOwnPhoto(db, 'wall-sit', 'start', 'exercise-photos/x.jpg', NOW)).toThrow();
    expect(getOwnPhotos(db, 'wall-sit')).toEqual({ start: null, end: null });
  });

  it('goes with its exercise', () => {
    const db = seededDb();
    setOwnPhoto(db, 'wall-sit', 'start', 'a.jpg', NOW);
    expect(() => setOwnPhoto(db, 'no-such-exercise', 'start', 'a.jpg', NOW)).toThrow();
  });
});
