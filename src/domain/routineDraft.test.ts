import {
  dayLabel,
  defaultIncrement,
  draftReducer,
  hasChanges,
  linksFromGroups,
  newDraft,
  supersetGroups,
  validateDraft,
} from './routineDraft';
import type { DraftAction, ExercisePatch, LibraryExercise, RoutineDraft } from './routineDraft';

const BENCH: LibraryExercise = { id: 'barbell-bench-press', name: 'Barbell bench press', loggingType: 'weighted' };
const ROW: LibraryExercise = { id: 'barbell-row', name: 'Barbell row', loggingType: 'weighted' };
const CURL: LibraryExercise = { id: 'dumbbell-curl', name: 'Dumbbell curl', loggingType: 'weighted' };
const PULL_UP: LibraryExercise = { id: 'pull-up', name: 'Pull-up', loggingType: 'bodyweight_plus' };
const PLANK: LibraryExercise = { id: 'plank', name: 'Plank', loggingType: 'timed' };
const LB5 = { value: 5, unit: 'lb' as const };

/** Applies each step in turn; a step may read the draft so far to find its keys. */
function run(draft: RoutineDraft, ...steps: (DraftAction | ((d: RoutineDraft) => DraftAction))[]): RoutineDraft {
  return steps.reduce((d, step) => draftReducer(d, typeof step === 'function' ? step(d) : step), draft);
}

const addTo = (dayIndex: number, exercise: LibraryExercise) => (d: RoutineDraft): DraftAction => ({
  type: 'addExercise',
  dayKey: d.days[dayIndex].key,
  exercise,
  increment: LB5,
});

/** A draft with one day, "Day 1", holding `list` in order. */
function oneDay(...list: LibraryExercise[]): RoutineDraft {
  return run(newDraft(), { type: 'addDay' }, ...list.map((e) => addTo(0, e)));
}

const ids = (d: RoutineDraft, day = 0) => d.days[day].exercises.map((e) => e.exerciseId);
const links = (d: RoutineDraft, day = 0) => d.days[day].exercises.map((e) => e.supersetWithNext);
const exerciseAction = (
  type: 'moveExercise' | 'removeExercise' | 'toggleSuperset',
  index: number,
  extra: { dir?: 'up' | 'down' } = {},
) => (d: RoutineDraft): DraftAction =>
  ({ type, dayKey: d.days[0].key, exerciseKey: d.days[0].exercises[index].key, ...extra }) as DraftAction;
const toggle = (index: number) => exerciseAction('toggleSuperset', index);
const move = (index: number, dir: 'up' | 'down') => exerciseAction('moveExercise', index, { dir });
const remove = (index: number) => exerciseAction('removeExercise', index);

describe('newDraft', () => {
  it('is a new routine with no name and no days', () => {
    expect(newDraft()).toMatchObject({ id: null, name: '', days: [] });
  });
});

describe('the routine name', () => {
  it('is kept as typed', () => {
    expect(draftReducer(newDraft(), { type: 'rename', name: 'My split ' }).name).toBe('My split ');
  });
});

describe('days', () => {
  it('adds a day at the end, with no exercises and its own key', () => {
    const d = run(newDraft(), { type: 'addDay', name: 'Upper' }, { type: 'addDay', name: 'Lower' });
    expect(d.days.map((day) => [day.name, day.id, day.exercises])).toEqual([
      ['Upper', null, []],
      ['Lower', null, []],
    ]);
    expect(d.days[0].key).not.toBe(d.days[1].key);
  });

  it('names a day added without a name "Day {n}"', () => {
    const d = run(newDraft(), { type: 'addDay' }, { type: 'addDay', name: '  ' });
    expect(d.days.map((day) => day.name)).toEqual(['Day 1', 'Day 2']);
  });

  it('renames one day, as typed', () => {
    const d = run(newDraft(), { type: 'addDay' }, { type: 'addDay' }, (s) => ({
      type: 'renameDay',
      dayKey: s.days[1].key,
      name: 'Legs ',
    }));
    expect(d.days.map((day) => day.name)).toEqual(['Day 1', 'Legs ']);
  });

  it('moves a day up or down, and not past either end', () => {
    const d = run(newDraft(), { type: 'addDay', name: 'A' }, { type: 'addDay', name: 'B' }, { type: 'addDay', name: 'C' });
    const up = draftReducer(d, { type: 'moveDay', dayKey: d.days[2].key, dir: 'up' });
    expect(up.days.map((day) => day.name)).toEqual(['A', 'C', 'B']);
    const down = draftReducer(d, { type: 'moveDay', dayKey: d.days[0].key, dir: 'down' });
    expect(down.days.map((day) => day.name)).toEqual(['B', 'A', 'C']);
    expect(draftReducer(d, { type: 'moveDay', dayKey: d.days[0].key, dir: 'up' })).toBe(d);
    expect(draftReducer(d, { type: 'moveDay', dayKey: d.days[2].key, dir: 'down' })).toBe(d);
  });

  it('deletes a day with its exercises', () => {
    const d = run(newDraft(), { type: 'addDay', name: 'A' }, { type: 'addDay', name: 'B' }, addTo(0, BENCH), addTo(1, ROW));
    const after = draftReducer(d, { type: 'deleteDay', dayKey: d.days[0].key });
    expect(after.days.map((day) => [day.name, ids(after, 0)])).toEqual([['B', ['barbell-row']]]);
  });

  it('ignores a day key it does not know', () => {
    const d = oneDay(BENCH);
    expect(draftReducer(d, { type: 'renameDay', dayKey: 'nope', name: 'X' })).toBe(d);
    expect(draftReducer(d, { type: 'deleteDay', dayKey: 'nope' })).toBe(d);
    expect(draftReducer(d, { type: 'addExercise', dayKey: 'nope', exercise: ROW, increment: LB5 })).toBe(d);
  });
});

describe('exercises', () => {
  it('adds an exercise from the library at the end of the day: 3 × 8–12 with the default increment', () => {
    const d = oneDay(BENCH);
    expect(d.days[0].exercises[0]).toMatchObject({
      id: null,
      exerciseId: 'barbell-bench-press',
      name: 'Barbell bench press',
      loggingType: 'weighted',
      setCount: 3,
      repMin: 8,
      repMax: 12,
      increment: 5,
      incrementUnit: 'lb',
      supersetWithNext: false,
    });
    const kg = draftReducer(d, {
      type: 'addExercise',
      dayKey: d.days[0].key,
      exercise: PULL_UP,
      increment: { value: 2.5, unit: 'kg' },
    });
    expect(kg.days[0].exercises[1]).toMatchObject({ exerciseId: 'pull-up', increment: 2.5, incrementUnit: 'kg' });
  });

  it('a timed exercise starts at 3 × 30–60 seconds with no increment, since it has no load to raise', () => {
    expect(oneDay(PLANK).days[0].exercises[0]).toMatchObject({ setCount: 3, repMin: 30, repMax: 60, increment: 0 });
  });

  it('the same exercise can be added to a day twice', () => {
    const d = oneDay(CURL, CURL);
    expect(ids(d)).toEqual(['dumbbell-curl', 'dumbbell-curl']);
    expect(d.days[0].exercises[0].key).not.toBe(d.days[0].exercises[1].key);
  });

  it('moves an exercise up or down, and not past either end', () => {
    const d = oneDay(BENCH, ROW, CURL);
    expect(ids(run(d, move(2, 'up')))).toEqual(['barbell-bench-press', 'dumbbell-curl', 'barbell-row']);
    expect(ids(run(d, move(0, 'down')))).toEqual(['barbell-row', 'barbell-bench-press', 'dumbbell-curl']);
    expect(run(d, move(0, 'up'))).toBe(d);
    expect(run(d, move(2, 'down'))).toBe(d);
  });

  it('removes an exercise', () => {
    expect(ids(run(oneDay(BENCH, ROW, CURL), remove(1)))).toEqual(['barbell-bench-press', 'dumbbell-curl']);
  });

  it('updates only the exercise it names', () => {
    const d = run(oneDay(BENCH, ROW), (s) => ({
      type: 'updateExercise',
      dayKey: s.days[0].key,
      exerciseKey: s.days[0].exercises[1].key,
      patch: { setCount: 5, repMin: 5, repMax: 8, increment: 2.5, incrementUnit: 'kg' },
    }));
    expect(d.days[0].exercises.map((e) => [e.setCount, e.repMin, e.repMax, e.increment, e.incrementUnit])).toEqual([
      [3, 8, 12, 5, 'lb'],
      [5, 5, 8, 2.5, 'kg'],
    ]);
  });

  const update = (d: RoutineDraft, patch: ExercisePatch) =>
    draftReducer(d, {
      type: 'updateExercise',
      dayKey: d.days[0].key,
      exerciseKey: d.days[0].exercises[0].key,
      patch,
    }).days[0].exercises[0];

  it('keeps the set count a whole number from 1 to 10', () => {
    const d = oneDay(BENCH);
    expect(update(d, { setCount: 0 }).setCount).toBe(1);
    expect(update(d, { setCount: 11 }).setCount).toBe(10);
    expect(update(d, { setCount: 4.4 }).setCount).toBe(4);
    expect(update(d, { setCount: Number.NaN }).setCount).toBe(3);
  });

  it('keeps the rep range whole, at least 1, and min ≤ max by moving the other end', () => {
    const d = oneDay(BENCH);
    expect(update(d, { repMin: 15 })).toMatchObject({ repMin: 15, repMax: 15 });
    expect(update(d, { repMax: 6 })).toMatchObject({ repMin: 6, repMax: 6 });
    expect(update(d, { repMin: 0 })).toMatchObject({ repMin: 1, repMax: 12 });
    expect(update(d, { repMin: 10, repMax: 6 })).toMatchObject({ repMin: 10, repMax: 10 });
  });

  it('keeps the increment at 0 or more; 0 means reps only', () => {
    const d = oneDay(BENCH);
    expect(update(d, { increment: 0 }).increment).toBe(0);
    expect(update(d, { increment: -5 }).increment).toBe(0);
    expect(update(d, { increment: 1.25, incrementUnit: 'kg' })).toMatchObject({ increment: 1.25, incrementUnit: 'kg' });
  });

  it('ignores an exercise key it does not know', () => {
    const d = oneDay(BENCH);
    expect(draftReducer(d, { type: 'removeExercise', dayKey: d.days[0].key, exerciseKey: 'nope' })).toBe(d);
    expect(draftReducer(d, { type: 'toggleSuperset', dayKey: d.days[0].key, exerciseKey: 'nope' })).toBe(d);
  });
});

describe('supersets', () => {
  it('links an exercise with the next, and toggling again breaks the link', () => {
    const d = run(oneDay(BENCH, ROW, CURL), toggle(0));
    expect(links(d)).toEqual([true, false, false]);
    expect(links(run(d, toggle(0)))).toEqual([false, false, false]);
  });

  it('does nothing on the last exercise', () => {
    const d = oneDay(BENCH, ROW);
    expect(run(d, toggle(1))).toBe(d);
  });

  it('breaking a link in a superset of three splits it there; linking onto one merges', () => {
    const three = run(oneDay(BENCH, ROW, CURL), toggle(0), toggle(1));
    expect(links(three)).toEqual([true, true, false]);
    expect(links(run(three, toggle(1)))).toEqual([true, false, false]);
    const merged = run(oneDay(BENCH, ROW, CURL), toggle(1), toggle(0));
    expect(supersetGroups(merged.days[0].exercises)).toEqual([1, 1, 1]);
  });

  it('a superset moves as a whole, and a single exercise moves past a whole superset', () => {
    const d = run(oneDay(BENCH, ROW, CURL), toggle(1));
    const up = run(d, move(1, 'up'));
    expect(ids(up)).toEqual(['barbell-row', 'dumbbell-curl', 'barbell-bench-press']);
    expect(links(up)).toEqual([true, false, false]);
    expect(run(d, move(2, 'up'))).toEqual(up);
    const down = run(d, move(0, 'down'));
    expect(ids(down)).toEqual(['barbell-row', 'dumbbell-curl', 'barbell-bench-press']);
    expect(links(down)).toEqual([true, false, false]);
  });

  it('removing an exercise keeps the rest of its superset together, and never leaves a link to nothing', () => {
    const three = run(oneDay(BENCH, ROW, CURL), toggle(0), toggle(1));
    expect(links(run(three, remove(1)))).toEqual([true, false]);
    const pair = run(oneDay(BENCH, ROW, CURL), toggle(0));
    expect(links(run(pair, remove(1)))).toEqual([false, false]);
    expect(links(run(pair, remove(0)))).toEqual([false, false]);
    const lastPair = run(oneDay(BENCH, ROW, CURL), toggle(1));
    expect(links(run(lastPair, remove(2)))).toEqual([false, false]);
  });

  it('numbers each run of linked exercises from 1, and links back from the numbers', () => {
    const d = run(oneDay(BENCH, ROW, CURL, PULL_UP, PLANK), toggle(0), toggle(2), toggle(3));
    const groups = supersetGroups(d.days[0].exercises);
    expect(groups).toEqual([1, 1, 2, 2, 2]);
    expect(linksFromGroups(groups)).toEqual(links(d));
    expect(linksFromGroups([null, 3, 3, null, 1, 2])).toEqual([false, true, false, false, false, false]);
  });
});

describe('validateDraft', () => {
  it('passes a routine with a name and days that all have exercises', () => {
    expect(validateDraft(run(oneDay(BENCH), { type: 'rename', name: 'Mine' }))).toEqual([]);
  });

  it('asks for a name', () => {
    expect(validateDraft(run(oneDay(BENCH), { type: 'rename', name: '   ' }))).toEqual(['Give the routine a name.']);
  });

  it('asks for at least one day', () => {
    expect(validateDraft(draftReducer(newDraft(), { type: 'rename', name: 'Mine' }))).toEqual(['Add at least one day.']);
  });

  it('names each day with no exercises, in order; a blank day name reads "Day {n}"', () => {
    const d = run(
      newDraft(),
      { type: 'rename', name: 'Mine' },
      { type: 'addDay', name: 'Push' },
      { type: 'addDay', name: 'Pull' },
      { type: 'addDay', name: 'Legs' },
      addTo(1, ROW),
      (s) => ({ type: 'renameDay', dayKey: s.days[2].key, name: ' ' }),
    );
    expect(validateDraft(d)).toEqual(['Push has no exercises.', 'Day 3 has no exercises.']);
    expect(dayLabel(d.days[0], 0)).toBe('Push');
    expect(dayLabel(d.days[2], 2)).toBe('Day 3');
  });

  it('lists every problem at once', () => {
    expect(validateDraft(newDraft())).toEqual(['Give the routine a name.', 'Add at least one day.']);
  });
});

describe('hasChanges', () => {
  it('is false for the same content, even when keys differ', () => {
    const d = oneDay(BENCH);
    expect(hasChanges(d, d)).toBe(false);
    const addedAndRemoved = run(d, addTo(0, ROW), remove(1));
    expect(hasChanges(d, addedAndRemoved)).toBe(false);
  });

  it('is true once anything the routine saves has changed', () => {
    const d = oneDay(BENCH, ROW);
    expect(hasChanges(d, draftReducer(d, { type: 'rename', name: 'X' }))).toBe(true);
    expect(hasChanges(d, run(d, toggle(0)))).toBe(true);
    expect(hasChanges(d, run(d, move(1, 'up')))).toBe(true);
  });
});

describe('defaultIncrement', () => {
  it("is the Settings default for the display unit: 5 lb or 2.5 kg out of the box", () => {
    const s = { defaultIncrementLb: 5, defaultIncrementKg: 2.5 };
    expect(defaultIncrement({ ...s, unit: 'lb' })).toEqual({ value: 5, unit: 'lb' });
    expect(defaultIncrement({ ...s, unit: 'kg' })).toEqual({ value: 2.5, unit: 'kg' });
    expect(defaultIncrement({ defaultIncrementLb: 10, defaultIncrementKg: 5, unit: 'kg' })).toEqual({ value: 5, unit: 'kg' });
  });
});
