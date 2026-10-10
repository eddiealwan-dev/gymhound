import { searchExercises } from './search';

const items = [
  { id: 'rdl', name: 'Romanian deadlift', aliases: ['RDL'] },
  { id: 'ohp', name: 'Overhead press', aliases: ['OHP', 'military press'] },
  { id: 'lat', name: 'Lat pulldown', aliases: ['pulldown'] },
  { id: 'ht', name: 'Hip thrust', aliases: [] },
  { id: 'sq', name: 'Barbell back squat', aliases: ['squat'] },
  { id: 'bd', name: 'Bench dip', aliases: [] },
  { id: 'ib', name: 'Incline bench press', aliases: [] },
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
});
