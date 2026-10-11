import { LIBRARY_EXERCISES } from '../seed/library.generated';
import { filterExercises, searchExercises } from './search';
import type { SearchItem } from './search';

const items: SearchItem[] = [
  { id: 'rdl', name: 'Romanian deadlift', aliases: ['RDL'], primaryMuscles: ['hamstrings'], equipment: 'barbell' },
  { id: 'ohp', name: 'Overhead press', aliases: ['OHP', 'military press'], primaryMuscles: ['front_delts'], equipment: 'barbell' },
  { id: 'lat', name: 'Lat pulldown', aliases: ['pulldown'], primaryMuscles: ['lats'], equipment: 'cable' },
  { id: 'ht', name: 'Hip thrust', aliases: [], primaryMuscles: ['glutes'], equipment: 'barbell' },
  { id: 'sq', name: 'Barbell back squat', aliases: ['squat'], primaryMuscles: ['quads'], equipment: 'barbell' },
  { id: 'bd', name: 'Bench dip', aliases: [], primaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { id: 'ib', name: 'Incline bench press', aliases: [], primaryMuscles: ['chest'], equipment: 'barbell' },
];
const ids = (q: string) => searchExercises(items, q).map((i) => i.id);

describe('searchExercises', () => {
  it('matches an alias', () => {
    expect(ids('rdl')).toEqual(['rdl']);
  });

  it('ignores case', () => {
    expect(ids('OHP')).toEqual(['ohp']);
  });

  it('matches each query word as a prefix of a word in the name', () => {
    expect(ids('lat pull')).toEqual(['lat']);
  });

  it('matches a whole name', () => {
    expect(ids('hip thrust')).toEqual(['ht']);
  });

  it('matches a word in the middle of a name or an alias', () => {
    expect(ids('squat')).toEqual(['sq']);
  });

  it('puts names that start with the query first, then sorts alphabetically', () => {
    expect(ids('bench')).toEqual(['bd', 'ib']);
    expect(ids('press')).toEqual(['ib', 'ohp']);
  });

  it('returns nothing when no word matches', () => {
    expect(ids('xyz')).toEqual([]);
  });

  it('returns everything alphabetically for an empty query', () => {
    expect(ids('')).toEqual(['sq', 'bd', 'ht', 'ib', 'lat', 'ohp', 'rdl']);
  });

  it('does not reorder the list it is given', () => {
    const before = items.map((i) => i.id);
    searchExercises(items, '');
    expect(items.map((i) => i.id)).toEqual(before);
  });

  describe('across muscles and equipment (§8.7, §18.8)', () => {
    it('matches a primary muscle by its label', () => {
      expect(ids('chest')).toEqual(['ib']);
      expect(ids('glu')).toEqual(['ht']);
    });

    it('matches a muscle label of two words by either word', () => {
      expect(ids('hamstrings')).toEqual(['rdl']);
      const back = [{ id: 'row', name: 'Seated row', aliases: [], primaryMuscles: ['upper_back' as const], equipment: 'cable' as const }];
      expect(searchExercises(back, 'upper').map((i) => i.id)).toEqual(['row']);
      expect(searchExercises(back, 'back').map((i) => i.id)).toEqual(['row']);
    });

    it('matches every delt as Shoulders', () => {
      expect(ids('shoulders')).toEqual(['ohp']);
    });

    it('matches equipment by its label', () => {
      expect(ids('cable')).toEqual(['lat']);
      expect(ids('bodyweight')).toEqual(['bd']);
    });

    it('lets the words of one query match different fields', () => {
      expect(ids('barbell chest')).toEqual(['ib']);
      expect(ids('press barbell')).toEqual(['ib', 'ohp']);
      expect(ids('cable chest')).toEqual([]);
    });

    it('does not match a secondary muscle, so a muscle lists what trains it first-hand', () => {
      const bench = [{ ...items[6], secondaryMuscles: ['triceps'] }];
      expect(searchExercises(bench, 'triceps')).toEqual([]);
    });
  });

  describe('the whole library', () => {
    const libraryIds = (q: string) => searchExercises(LIBRARY_EXERCISES, q).map((e) => e.id);

    it('"chest" finds the bench press by its muscle', () => {
      expect(libraryIds('chest')).toContain('barbell-bench-press');
    });

    it('"band" finds every band exercise by its equipment', () => {
      const bands = LIBRARY_EXERCISES.filter((e) => e.equipment === 'band').map((e) => e.id);
      expect(bands.length).toBeGreaterThan(10);
      expect(libraryIds('band')).toEqual(expect.arrayContaining(bands));
    });

    it('"rdl" finds the Romanian deadlifts by their alias', () => {
      expect(libraryIds('rdl')).toEqual(['dumbbell-romanian-deadlift', 'barbell-romanian-deadlift']);
    });

    it('"ohp", "lat pulldown" and "hip thrust" resolve (§8.7)', () => {
      expect(libraryIds('ohp')).toContain('barbell-overhead-press');
      expect(libraryIds('lat pulldown')).toContain('lat-pulldown');
      expect(libraryIds('hip thrust')).toContain('barbell-hip-thrust');
    });
  });
});

describe('filterExercises', () => {
  const filtered = (filter: Parameters<typeof filterExercises>[1]) => filterExercises(items, filter).map((i) => i.id);

  it('keeps everything, in order, with no filter', () => {
    expect(filtered({})).toEqual(items.map((i) => i.id));
  });

  it('keeps the exercises whose primary muscle is the one chosen', () => {
    expect(filtered({ muscle: 'chest' })).toEqual(['ib']);
    expect(filtered({ muscle: 'triceps' })).toEqual(['bd']);
  });

  it('treats the three delts as one, Shoulders', () => {
    const delts: SearchItem[] = [
      { id: 'raise', name: 'Lateral raise', aliases: [], primaryMuscles: ['side_delts'], equipment: 'dumbbell' },
      { id: 'fly', name: 'Reverse fly', aliases: [], primaryMuscles: ['rear_delts'], equipment: 'dumbbell' },
      ...items,
    ];
    expect(filterExercises(delts, { muscle: 'front_delts' }).map((i) => i.id)).toEqual(['raise', 'fly', 'ohp']);
  });

  it('keeps the exercises that use the equipment chosen', () => {
    expect(filtered({ equipment: 'cable' })).toEqual(['lat']);
  });

  it('combines a muscle and equipment: both must hold', () => {
    expect(filtered({ muscle: 'chest', equipment: 'barbell' })).toEqual(['ib']);
    expect(filtered({ muscle: 'chest', equipment: 'cable' })).toEqual([]);
  });

  it('combines with a search', () => {
    expect(searchExercises(filterExercises(items, { equipment: 'barbell' }), 'press').map((i) => i.id)).toEqual(['ib', 'ohp']);
  });

  it('does not change the list it is given', () => {
    const before = items.map((i) => i.id);
    filterExercises(items, { muscle: 'chest' });
    expect(items.map((i) => i.id)).toEqual(before);
  });
});
