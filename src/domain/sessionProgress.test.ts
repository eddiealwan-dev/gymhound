import {
  countLabel,
  exerciseProgress,
  nextSetId,
  progressLabel,
  progressParts,
  restUpText,
  workoutProgress,
  type ProgressExercise,
} from './sessionProgress';

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

describe('progressParts and progressLabel: the line under the session name', () => {
  it('reads done of total sets, then the time, in two parts so the count can give way first (Round 4)', () => {
    expect(progressParts({ done: 5, total: 18 }, '24:10')).toEqual({ count: '5/18 sets', time: ' · 24:10' });
    expect(progressParts({ done: 0, total: 1 }, '0:05')).toEqual({ count: '0/1 set', time: ' · 0:05' });
  });

  it('is the time alone with no sets', () => {
    expect(progressParts({ done: 0, total: 0 }, '0:01')).toEqual({ count: '', time: '0:01' });
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
  const ex = (id: string, position: number, sets: ProgressExercise['sets'], supersetGroup: number | null = null): ProgressExercise => ({
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

  it("in a superset, a member's warmups come first, then the members alternate by ticked non-warmup sets", () => {
    const w = (id: string, position: number) => ({ id, position, setType: 'warmup' as const, done: false });
    const a = ex('A', 0, [w('aw1', 0), w('aw2', 1), s('a1', 2), s('a2', 3), s('a3', 4)], 1);
    const b = ex('B', 1, [s('b1', 0), s('b2', 1), s('b3', 2)], 1);
    const order: string[] = [];
    let workout = [a, b];
    for (let next = nextSetId(workout); next !== null; next = nextSetId(workout)) {
      order.push(next);
      const done = next;
      workout = workout.map((e) => ({ ...e, sets: e.sets.map((set) => (set.id === done ? { ...set, done: true } : set)) }));
    }
    expect(order).toEqual(['aw1', 'aw2', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3']);
  });

  it("in a superset, a later member's warmups still come before an earlier member's working sets", () => {
    const w = (id: string, position: number) => ({ id, position, setType: 'warmup' as const, done: false });
    expect(nextSetId([ex('A', 0, [s('a1', 0), s('a2', 1)], 1), ex('B', 1, [w('bw1', 0), s('b1', 1)], 1)])).toBe('bw1');
  });

  it('a lone exercise after a superset run waits for the run, though it has fewer sets ticked', () => {
    const a = ex('A', 0, [s('a1', 0, true), s('a2', 1)], 1);
    const b = ex('B', 1, [s('b1', 0, true), s('b2', 1)], 1);
    const c = ex('C', 2, [s('c1', 0), s('c2', 1)]);
    expect(nextSetId([a, b, c])).toBe('a2');

    // The run is done: the lone exercise is next.
    const runDone = [ex('A', 0, [s('a1', 0, true), s('a2', 1, true)], 1), ex('B', 1, [s('b1', 0, true), s('b2', 1, true)], 1), c];
    expect(nextSetId(runDone)).toBe('c1');
  });
});

describe("restUpText: what the rest row says once the rest is up (spec 18.6)", () => {
  const s = (id: string, position: number, done = false, setType: 'working' | 'warmup' = 'working') => ({ id, position, setType, done });
  const ex = (id: string, name: string, position: number, sets: ReturnType<typeof s>[]): ProgressExercise => ({
    id,
    name,
    position,
    supersetGroup: null,
    sets,
  });

  it('names the next set when it is in the same exercise', () => {
    expect(restUpText([ex('bench', 'Bench Press', 0, [s('s0', 0, true), s('s1', 1), s('s2', 2)])], 's0')).toBe("Rest's up · Set 2 next");
  });

  it('names the next exercise when the next set is in another one', () => {
    const exercises = [ex('bench', 'Bench Press', 0, [s('s0', 0, true), s('s1', 1, true)]), ex('row', 'Barbell row', 1, [s('r0', 0)])];
    expect(restUpText(exercises, 's1')).toBe("Rest's up · Barbell row next");
  });

  it('says Warmup when the next set is a warmup in the same exercise', () => {
    expect(restUpText([ex('bench', 'Bench Press', 0, [s('w0', 0, true, 'warmup'), s('w1', 1, false, 'warmup'), s('s0', 2)])], 'w0')).toBe(
      "Rest's up · Warmup next",
    );
  });

  it("in a superset, names the member whose turn it is, warmups not counting toward the turn", () => {
    const sup = (id: string, name: string, position: number, sets: ReturnType<typeof s>[]): ProgressExercise => ({
      ...ex(id, name, position, sets),
      supersetGroup: 1,
    });
    const exercises = [
      sup('bench', 'Bench Press', 0, [s('aw1', 0, true, 'warmup'), s('aw2', 1, true, 'warmup'), s('a1', 2, true), s('a2', 3), s('a3', 4)]),
      sup('row', 'Barbell row', 1, [s('b1', 0, true), s('b2', 1), s('b3', 2)]),
    ];
    expect(restUpText(exercises, 'b1')).toBe("Rest's up · Bench Press next");
  });

  it('waits for the last set of the exercise: names its own next set while an earlier exercise is still open (Round 4, A5)', () => {
    const exercises = [ex('squat', 'Squat', 0, [s('q0', 0)]), ex('bench', 'Bench Press', 1, [s('s0', 0, true), s('s1', 1)])];
    expect(restUpText(exercises, 's0')).toBe("Rest's up · Set 2 next");
  });

  it('once the exercise is done, names where the workout goes next, even an earlier exercise left open', () => {
    const exercises = [
      ex('squat', 'Squat', 0, [s('q0', 0)]),
      ex('bench', 'Bench Press', 1, [s('s0', 0, true), s('s1', 1, true)]),
      ex('row', 'Barbell row', 2, [s('r0', 0)]),
    ];
    expect(restUpText(exercises, 's1')).toBe("Rest's up · Squat next");
  });

  it("in a superset, waits for the run: names the member whose turn it is while an earlier exercise is still open", () => {
    const sup = (id: string, name: string, position: number, sets: ReturnType<typeof s>[]): ProgressExercise => ({
      ...ex(id, name, position, sets),
      supersetGroup: 1,
    });
    const exercises = [
      ex('squat', 'Squat', 0, [s('q0', 0)]),
      sup('bench', 'Bench Press', 1, [s('a1', 0, true), s('a2', 1)]),
      sup('row', 'Barbell row', 2, [s('b1', 0), s('b2', 1)]),
    ];
    expect(restUpText(exercises, 'a1')).toBe("Rest's up · Barbell row next");
    const rowTicked = exercises.map((e) => (e.id === 'row' ? { ...e, sets: [s('b1', 0, true), s('b2', 1)] } : e));
    expect(restUpText(rowTicked, 'b1')).toBe("Rest's up · Bench Press next");
    const benchSecond = rowTicked.map((e) => (e.id === 'bench' ? { ...e, sets: [s('a1', 0, true), s('a2', 1, true)] } : e));
    expect(restUpText(benchSecond, 'a2')).toBe("Rest's up · Barbell row next");
  });

  it('with no set under the rest, names the next set of the workout', () => {
    const exercises = [ex('squat', 'Squat', 0, [s('q0', 0)]), ex('bench', 'Bench Press', 1, [s('s0', 0, true), s('s1', 1)])];
    expect(restUpText(exercises, '')).toBe("Rest's up · Squat next");
  });

  it("is Rest's up alone when every set is done", () => {
    expect(restUpText([ex('bench', 'Bench Press', 0, [s('s0', 0, true), s('s1', 1, true)])], 's1')).toBe("Rest's up");
  });
});
