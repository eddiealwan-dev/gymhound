import { countLabel, exerciseProgress, nextSetId, progressLabel, progressText, workoutProgress, type ProgressExercise } from './sessionProgress';

describe('workoutProgress: every set of the workout, warmups included', () => {
  it('counts the done sets and all the sets', () => {
    expect(workoutProgress([{ sets: [{ done: true }, { done: true }, { done: false }] }, { sets: [{ done: false }] }])).toEqual({
      done: 2,
      total: 4,
    });
  });

  it('is 0 of 0 with no exercises', () => {
    expect(workoutProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('exerciseProgress: the sets of one exercise', () => {
  it('counts the done sets and all the sets', () => {
    expect(exerciseProgress({ sets: [{ done: true }, { done: false }] })).toEqual({ done: 1, total: 2 });
  });
});

describe('progressText and progressLabel: the line under the session name', () => {
  it('reads done of total sets, then the time', () => {
    expect(progressText({ done: 5, total: 18 }, '24:10')).toBe('5/18 sets · 24:10');
    expect(progressText({ done: 0, total: 1 }, '0:05')).toBe('0/1 set · 0:05');
  });

  it('is the time alone with no sets', () => {
    expect(progressText({ done: 0, total: 0 }, '0:01')).toBe('0:01');
  });

  it('says it in words for the screen reader', () => {
    expect(progressLabel({ done: 2, total: 4 }, '0:01')).toBe('2 of 4 sets done. Workout time 0:01');
    expect(progressLabel({ done: 0, total: 0 }, '0:01')).toBe('Workout time 0:01');
  });
});

describe('countLabel: the block count in words', () => {
  it('says done of total', () => {
    expect(countLabel({ done: 1, total: 4 })).toBe('1 of 4 sets done');
    expect(countLabel({ done: 0, total: 1 })).toBe('0 of 1 set done');
  });
});

describe('nextSetId: the next set to do (spec 18.6)', () => {
  const s = (id: string, position: number, done = false) => ({ id, position, setType: 'working' as const, done });
  const ex = (id: string, position: number, sets: ReturnType<typeof s>[], supersetGroup: number | null = null): ProgressExercise => ({
    id,
    name: id,
    position,
    supersetGroup,
    sets,
  });

  it('is the first unticked set of a lone exercise', () => {
    expect(nextSetId([ex('A', 0, [s('a1', 0, true), s('a2', 1), s('a3', 2)])])).toBe('a2');
  });

  it('moves on to the next exercise once one is all ticked', () => {
    expect(nextSetId([ex('A', 0, [s('a1', 0, true), s('a2', 1, true)]), ex('B', 1, [s('b1', 0), s('b2', 1)])])).toBe('b1');
  });

  it('is null when every set is ticked, or there are none', () => {
    expect(nextSetId([ex('A', 0, [s('a1', 0, true)])])).toBeNull();
    expect(nextSetId([])).toBeNull();
  });

  it('is the first unticked set even when a later one is ticked', () => {
    expect(nextSetId([ex('A', 0, [s('a1', 0), s('a2', 1, true)])])).toBe('a1');
  });

  it('orders exercises and sets by position', () => {
    expect(nextSetId([ex('B', 1, [s('b1', 0)]), ex('A', 0, [s('a2', 1), s('a1', 0)])])).toBe('a1');
  });

  it('in a superset, is in the member with the fewest ticked sets, the earlier member winning a tie', () => {
    expect(nextSetId([ex('A', 0, [s('a1', 0, true), s('a2', 1)], 1), ex('B', 1, [s('b1', 0), s('b2', 1)], 1)])).toBe('b1');
    expect(nextSetId([ex('A', 0, [s('a1', 0, true), s('a2', 1)], 1), ex('B', 1, [s('b1', 0, true), s('b2', 1)], 1)])).toBe('a2');
  });

  it('skips a superset member with nothing left to do', () => {
    expect(nextSetId([ex('A', 0, [s('a1', 0)], 1), ex('B', 1, [s('b1', 0, true), s('b2', 1, true)], 1)])).toBe('a1');
  });
});
