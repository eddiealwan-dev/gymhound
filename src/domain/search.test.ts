import { LIBRARY_EXERCISES } from '../seed/library.generated';
import { filterExercises, searchExercises } from './search';
import type { SearchItem } from './search';

/** In name order, as `listExercises` reads them. */
const items: SearchItem[] = [
  { id: 'sq', name: 'Barbell back squat', aliases: ['squat'], primaryMuscles: ['quads'], equipment: 'barbell' },
  { id: 'bd', name: 'Bench dip', aliases: [], primaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { id: 'ht', name: 'Hip thrust', aliases: [], primaryMuscles: ['glutes'], equipment: 'barbell' },
  { id: 'ib', name: 'Incline bench press', aliases: [], primaryMuscles: ['chest'], equipment: 'barbell' },
  { id: 'lat', name: 'Lat pulldown', aliases: ['pulldown'], primaryMuscles: ['lats'], equipment: 'cable' },
  { id: 'ohp', name: 'Overhead press', aliases: ['OHP', 'military press'], primaryMuscles: ['front_delts'], equipment: 'barbell' },
  { id: 'rdl', name: 'Romanian deadlift', aliases: ['RDL'], primaryMuscles: ['hamstrings'], equipment: 'barbell' },
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

  it('puts names that start with the query first, then the rest, each in name order', () => {
    expect(ids('bench')).toEqual(['bd', 'ib']);
    expect(ids('press')).toEqual(['ib', 'ohp']);
    expect(ids('pull')).toEqual(['lat']);
    expect(ids('b')).toEqual(['sq', 'bd', 'ht', 'ib', 'ohp', 'rdl']);
  });

  it('keeps the order it is given within each group, without sorting again (the list comes sorted)', () => {
    const shuffled = [items[3], items[6], items[1], items[0], items[5]];
    expect(searchExercises(shuffled, 'b').map((i) => i.id)).toEqual(['bd', 'sq', 'ib', 'rdl', 'ohp']);
    expect(searchExercises(shuffled, '').map((i) => i.id)).toEqual(['ib', 'rdl', 'bd', 'sq', 'ohp']);
  });

  it('returns nothing when no word matches', () => {
    expect(ids('xyz')).toEqual([]);
  });

  it('returns everything, in the order given, for an empty query', () => {
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

    describe('delts by name', () => {
      const delts: SearchItem[] = [
        { id: 'arnold', name: 'Arnold press', aliases: [], primaryMuscles: ['front_delts'], equipment: 'dumbbell' },
        { id: 'bench', name: 'Bench press', aliases: [], primaryMuscles: ['chest'], equipment: 'barbell' },
        { id: 'face', name: 'Face pull', aliases: [], primaryMuscles: ['rear_delts', 'upper_back'], equipment: 'cable' },
        { id: 'fdr', name: 'Front dumbbell raise', aliases: [], primaryMuscles: ['front_delts'], equipment: 'dumbbell' },
        { id: 'fsq', name: 'Front squat', aliases: [], primaryMuscles: ['quads'], equipment: 'barbell' },
        { id: 'lat', name: 'Lateral raise', aliases: [], primaryMuscles: ['side_delts'], equipment: 'dumbbell' },
        { id: 'rdf', name: 'Rear delt fly', aliases: [], primaryMuscles: ['upper_back'], equipment: 'dumbbell' },
        { id: 'side', name: 'Side plank', aliases: [], primaryMuscles: ['obliques'], equipment: 'bodyweight' },
        { id: 'upr', name: 'Upright row', aliases: [], primaryMuscles: ['traps'], equipment: 'barbell' },
      ];
      const deltIds = (q: string) => searchExercises(delts, q).map((i) => i.id);

      it('"delts" and "delt" find every exercise whose primary muscle is a delt, and a name that says "delt"', () => {
        expect(deltIds('delts')).toEqual(['arnold', 'face', 'fdr', 'lat']);
        expect(deltIds('delt')).toEqual(['arnold', 'face', 'fdr', 'lat', 'rdf']);
        expect(deltIds('DELTS')).toEqual(['arnold', 'face', 'fdr', 'lat']);
      });

      it('"front delt", "side delt" and "rear delt" find only that delt', () => {
        expect(deltIds('front delt')).toEqual(['arnold', 'fdr']);
        expect(deltIds('front delts')).toEqual(['arnold', 'fdr']);
        expect(deltIds('side delt')).toEqual(['lat']);
        expect(deltIds('side delts')).toEqual(['lat']);
        expect(deltIds('rear delt')).toEqual(['rdf', 'face']);
        expect(deltIds('rear delts')).toEqual(['face']);
      });

      it('combines a delt with other words', () => {
        expect(deltIds('rear delt cable')).toEqual(['face']);
        expect(deltIds('front delt dumbbell')).toEqual(['arnold', 'fdr']);
        expect(deltIds('dumbbell delts')).toEqual(['arnold', 'fdr', 'lat']);
      });

      it('"front", "side" and "rear" on their own still find only names and aliases', () => {
        expect(deltIds('front')).toEqual(['fdr', 'fsq']);
        expect(deltIds('side')).toEqual(['side']);
        expect(deltIds('rear')).toEqual(['rdf']);
        expect(deltIds('front d')).toEqual(['fdr']);
      });

      it('does not match a delt that is only a secondary muscle', () => {
        const press = [{ id: 'bench', name: 'Bench press', aliases: [], primaryMuscles: ['chest' as const], secondaryMuscles: ['front_delts' as const], equipment: 'barbell' as const }];
        expect(searchExercises(press, 'delts')).toEqual([]);
        expect(searchExercises(press, 'front delt')).toEqual([]);
      });
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
      const bench = [{ ...items[3], secondaryMuscles: ['triceps'] }];
      expect(searchExercises(bench, 'triceps')).toEqual([]);
    });
  });

  describe('the whole library', () => {
    /** The library in the order `listExercises` reads it: by name without regard to case, then by id. */
    const library = [...LIBRARY_EXERCISES].sort((a, b) => {
      const [x, y] = [a.name.toLowerCase(), b.name.toLowerCase()];
      return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const libraryIds = (q: string) => searchExercises(library, q).map((e) => e.id);

    it('orders results as the old sort did: names that start with the query, then alphabetically (localeCompare)', () => {
      const oldOrder = (q: string) => {
        const start = q.toLowerCase();
        return searchExercises(library, q)
          .map((e) => ({ id: e.id, name: e.name.toLowerCase(), first: e.name.toLowerCase().startsWith(start) }))
          .sort((a, b) => Number(b.first) - Number(a.first) || a.name.localeCompare(b.name))
          .map((r) => r.id);
      };
      for (const q of [...'abcdefghijklmnopqrstuvwxyz0123456789', '', 'bench', 'press', 'curl', 'row', 'squat', 'dumbbell', 'cable', 'chest', 'back', 'raise', 'fly', 'shoulders', 'band', 'leg', 'lat', 'hip thrust']) {
        expect([q, libraryIds(q)]).toEqual([q, oldOrder(q)]);
      }
    });

    it('"delts" finds every exercise whose primary muscle is a delt, and "rear delt" the rear-delt ones', () => {
      const delts = library.filter((e) => e.primaryMuscles.some((m) => m.endsWith('_delts'))).map((e) => e.id);
      expect(delts.length).toBeGreaterThan(10);
      expect(libraryIds('delts')).toEqual(expect.arrayContaining(delts));
      const rear = library.filter((e) => e.primaryMuscles.includes('rear_delts')).map((e) => e.id);
      expect(rear.length).toBeGreaterThan(0);
      expect(libraryIds('rear delt')).toEqual(expect.arrayContaining(rear));
      const sideOnly = library.filter((e) => e.primaryMuscles.includes('side_delts') && !e.primaryMuscles.includes('rear_delts'));
      expect(sideOnly.length).toBeGreaterThan(0);
      for (const e of sideOnly) if (!/\brear\b/i.test(e.name) && !e.aliases.some((a) => /\brear\b/i.test(a))) expect(libraryIds('rear delt')).not.toContain(e.id);
    });

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
