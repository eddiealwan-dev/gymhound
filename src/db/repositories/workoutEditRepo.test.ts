/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { routineExercises, sets, workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import {
  addExerciseToWorkout,
  addSet,
  moveExercise,
  removeExercise,
  removeSet,
  replaceExercise,
  setShowRpe,
  toggleSupersetWithNext,
  updateSet,
} from './workoutEditRepo';
import { startEmptyWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';
const PUSH_A_ORDER = [
  'barbell-bench-press',
  'barbell-overhead-press',
  'incline-dumbbell-press',
  'dumbbell-lateral-raise',
  'cable-triceps-pushdown',
];

/** Starts Push A and returns the database and the ids of its five workout exercises, in order. */
function startPushA(): { db: Db; workoutId: string; ids: string[] } {
  const db = seededDb();
  const workoutId = startWorkoutFromDay(db, PUSH_A, NOW);
  return { db, workoutId, ids: view(db).exercises.map((e) => e.id) };
}

function view(db: Db) {
  return getActiveWorkoutView(db)!;
}

function exerciseOrder(db: Db): string[] {
  return view(db).exercises.map((e) => e.exerciseId);
}

function positions(db: Db): number[] {
  return view(db).exercises.map((e) => e.position);
}

function groups(db: Db): (number | null)[] {
  return view(db).exercises.map((e) => e.supersetGroup);
}

function rawWorkoutExercise(db: Db, id: string) {
  return db.select().from(workoutExercises).where(eq(workoutExercises.id, id)).get()!;
}

function setPositions(db: Db, exerciseIndex = 0): number[] {
  return view(db).exercises[exerciseIndex].sets.map((s) => s.position);
}

describe('moveExercise', () => {
  it('does nothing at the top', () => {
    const { db, ids } = startPushA();
    moveExercise(db, ids[0], 'up');
    expect(exerciseOrder(db)).toEqual(PUSH_A_ORDER);
    expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
  });

  it('does nothing at the bottom', () => {
    const { db, ids } = startPushA();
    moveExercise(db, ids[4], 'down');
    expect(exerciseOrder(db)).toEqual(PUSH_A_ORDER);
    expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves the first exercise down one place', () => {
    const { db, ids } = startPushA();
    moveExercise(db, ids[0], 'down');
    expect(exerciseOrder(db)).toEqual([
      'barbell-overhead-press',
      'barbell-bench-press',
      'incline-dumbbell-press',
      'dumbbell-lateral-raise',
      'cable-triceps-pushdown',
    ]);
    expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves a middle exercise up one place and carries its sets with it', () => {
    const { db, ids } = startPushA();
    const setIds = view(db).exercises[2].sets.map((s) => s.id);
    moveExercise(db, ids[2], 'up');
    expect(exerciseOrder(db)).toEqual([
      'barbell-bench-press',
      'incline-dumbbell-press',
      'barbell-overhead-press',
      'dumbbell-lateral-raise',
      'cable-triceps-pushdown',
    ]);
    expect(view(db).exercises[1].sets.map((s) => s.id)).toEqual(setIds);
    expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
  });
  describe('with supersets', () => {
    const [BENCH, OHP, INCLINE, LATERAL, PUSHDOWN] = PUSH_A_ORDER;

    it('moves a whole superset past the next exercise and keeps the group intact', () => {
      const { db, ids } = startPushA();
      toggleSupersetWithNext(db, ids[0]);
      const group = groups(db)[0];
      moveExercise(db, ids[1], 'down');
      expect(exerciseOrder(db)).toEqual([INCLINE, BENCH, OHP, LATERAL, PUSHDOWN]);
      expect(groups(db)).toEqual([null, group, group, null, null]);
      expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
    });

    it('moves a whole superset up from either member and keeps the members in order', () => {
      const { db, ids } = startPushA();
      toggleSupersetWithNext(db, ids[2]);
      const group = groups(db)[2];
      moveExercise(db, ids[2], 'up');
      expect(exerciseOrder(db)).toEqual([BENCH, INCLINE, LATERAL, OHP, PUSHDOWN]);
      expect(groups(db)).toEqual([null, group, group, null, null]);

      moveExercise(db, ids[3], 'up');
      expect(exerciseOrder(db)).toEqual([INCLINE, LATERAL, BENCH, OHP, PUSHDOWN]);
      expect(groups(db)).toEqual([group, group, null, null, null]);
      expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
    });

    it('lets a single exercise jump over a whole superset', () => {
      const { db, ids } = startPushA();
      toggleSupersetWithNext(db, ids[0]);
      const group = groups(db)[0];
      moveExercise(db, ids[1], 'down');
      expect(exerciseOrder(db)).toEqual([INCLINE, BENCH, OHP, LATERAL, PUSHDOWN]);
      moveExercise(db, ids[2], 'down');
      expect(exerciseOrder(db)).toEqual([BENCH, OHP, INCLINE, LATERAL, PUSHDOWN]);
      expect(groups(db)).toEqual([group, group, null, null, null]);
      expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
    });

    it('does nothing when the superset is already first or last', () => {
      const { db, ids } = startPushA();
      toggleSupersetWithNext(db, ids[0]);
      toggleSupersetWithNext(db, ids[3]);
      const before = groups(db);
      moveExercise(db, ids[0], 'up');
      moveExercise(db, ids[1], 'up');
      moveExercise(db, ids[3], 'down');
      moveExercise(db, ids[4], 'down');
      expect(exerciseOrder(db)).toEqual(PUSH_A_ORDER);
      expect(groups(db)).toEqual(before);
      expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
    });

    it('moves one superset past another', () => {
      const { db, ids } = startPushA();
      toggleSupersetWithNext(db, ids[0]);
      toggleSupersetWithNext(db, ids[3]);
      const [first, second] = [groups(db)[0], groups(db)[3]];
      expect(first).not.toBe(second);

      moveExercise(db, ids[2], 'up');
      expect(exerciseOrder(db)).toEqual([INCLINE, BENCH, OHP, LATERAL, PUSHDOWN]);

      moveExercise(db, ids[3], 'up');
      expect(exerciseOrder(db)).toEqual([INCLINE, LATERAL, PUSHDOWN, BENCH, OHP]);
      expect(groups(db)).toEqual([null, second, second, first, first]);
      expect(positions(db)).toEqual([0, 1, 2, 3, 4]);
    });

    it('moves a superset in the middle with its sets', () => {
      const { db, ids } = startPushA();
      toggleSupersetWithNext(db, ids[2]);
      const setIds = view(db).exercises.map((e) => e.sets.map((s) => s.id));
      moveExercise(db, ids[2], 'down');
      expect(exerciseOrder(db)).toEqual([BENCH, OHP, PUSHDOWN, INCLINE, LATERAL]);
      expect(view(db).exercises.map((e) => e.sets.map((s) => s.id))).toEqual([
        setIds[0],
        setIds[1],
        setIds[4],
        setIds[2],
        setIds[3],
      ]);
    });
  });
});

describe('toggleSupersetWithNext', () => {
  it('pairs an exercise with the next one, and a second toggle unpairs them', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[0]);
    const paired = groups(db);
    expect(paired[0]).not.toBeNull();
    expect(paired[1]).toBe(paired[0]);
    expect(paired.slice(2)).toEqual([null, null, null]);

    toggleSupersetWithNext(db, ids[0]);
    expect(groups(db)).toEqual([null, null, null, null, null]);
  });

  it('does nothing on the last exercise', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[4]);
    expect(groups(db)).toEqual([null, null, null, null, null]);
  });

  it('numbers a new group one above the highest in the workout', () => {
    const { db, ids } = startPushA();
    db.update(workoutExercises).set({ supersetGroup: 3 }).where(eq(workoutExercises.id, ids[3])).run();
    db.update(workoutExercises).set({ supersetGroup: 3 }).where(eq(workoutExercises.id, ids[4])).run();
    toggleSupersetWithNext(db, ids[0]);
    expect(groups(db)).toEqual([4, 4, null, 3, 3]);
  });

  it('adds the next exercise to the group the first one is already in', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[0]);
    toggleSupersetWithNext(db, ids[1]);
    const g = groups(db);
    expect(g[0]).not.toBeNull();
    expect(g.slice(0, 3)).toEqual([g[0], g[0], g[0]]);
    expect(g.slice(3)).toEqual([null, null]);
  });

  it('adds the first exercise to the group the next one is already in', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[1]);
    toggleSupersetWithNext(db, ids[0]);
    const g = groups(db);
    expect(g[0]).not.toBeNull();
    expect(g.slice(0, 3)).toEqual([g[0], g[0], g[0]]);
  });

  it('merges two neighbouring groups into one', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[0]);
    toggleSupersetWithNext(db, ids[2]);
    expect(new Set(groups(db).slice(0, 4)).size).toBe(2);
    toggleSupersetWithNext(db, ids[1]);
    const g = groups(db);
    expect(g[0]).not.toBeNull();
    expect(g.slice(0, 4)).toEqual([g[0], g[0], g[0], g[0]]);
    expect(g[4]).toBeNull();
  });

  it('splits a group of three at the toggled boundary and leaves no group of one', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[0]);
    toggleSupersetWithNext(db, ids[1]);

    toggleSupersetWithNext(db, ids[0]);
    let g = groups(db);
    expect(g[0]).toBeNull();
    expect(g[1]).not.toBeNull();
    expect(g[2]).toBe(g[1]);

    toggleSupersetWithNext(db, ids[1]);
    g = groups(db);
    expect(g).toEqual([null, null, null, null, null]);
  });
});

describe('addSet and removeSet', () => {
  it('appends a blank working set to the exercise', () => {
    const { db, ids } = startPushA();
    const newId = addSet(db, ids[0]);
    const bench = view(db).exercises[0];
    expect(bench.sets).toHaveLength(5);
    expect(bench.sets[4]).toMatchObject({
      id: newId,
      position: 4,
      setType: 'working',
      weight: null,
      weightUnit: null,
      reps: null,
      rpe: null,
      durationS: null,
      distance: null,
      distanceUnit: null,
      done: false,
    });
    expect(view(db).exercises[1].sets).toHaveLength(3);
  });

  it('appends at position 0 to an exercise with no sets', () => {
    const { db, ids } = startPushA();
    for (const id of view(db).exercises[0].sets.map((s) => s.id)) removeSet(db, id);
    expect(view(db).exercises[0].sets).toEqual([]);
    addSet(db, ids[0]);
    expect(setPositions(db)).toEqual([0]);
  });

  it('renumbers the remaining sets from 0 when one is removed', () => {
    const { db, ids } = startPushA();
    addSet(db, ids[0]);
    const before = view(db).exercises[0].sets.map((s) => s.id);
    expect(before).toHaveLength(5);

    removeSet(db, before[2]);
    const after = view(db).exercises[0].sets;
    expect(after.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    expect(after.map((s) => s.id)).toEqual([before[0], before[1], before[3], before[4]]);
    expect(db.select().from(sets).where(eq(sets.id, before[2])).get()).toBeUndefined();
  });

  it('keeps a removed set from touching another exercise', () => {
    const { db } = startPushA();
    const ohpSets = view(db).exercises[1].sets.map((s) => s.id);
    removeSet(db, view(db).exercises[0].sets[0].id);
    expect(view(db).exercises[1].sets.map((s) => s.id)).toEqual(ohpSets);
    expect(setPositions(db, 1)).toEqual([0, 1, 2]);
  });
});

describe('updateSet', () => {
  it('writes a set type, weight and unit that the view then shows', () => {
    const { db } = startPushA();
    const id = view(db).exercises[0].sets[0].id;
    updateSet(db, id, { setType: 'warmup', weight: 95, weightUnit: 'lb' });
    expect(view(db).exercises[0].sets[0]).toMatchObject({
      id,
      setType: 'warmup',
      weight: 95,
      weightUnit: 'lb',
      reps: null,
      done: false,
    });
  });

  it('changes only the fields in the patch', () => {
    const { db } = startPushA();
    const id = view(db).exercises[0].sets[1].id;
    updateSet(db, id, { weight: 100, weightUnit: 'kg', reps: 5, rpe: 8.5 });
    updateSet(db, id, { reps: 6 });
    expect(view(db).exercises[0].sets[1]).toMatchObject({
      setType: 'working',
      weight: 100,
      weightUnit: 'kg',
      reps: 6,
      rpe: 8.5,
    });
    expect(view(db).exercises[0].sets[0]).toMatchObject({ weight: null, reps: null, rpe: null });
  });

  it('clears a field set to null and writes duration and distance', () => {
    const { db } = startPushA();
    const id = view(db).exercises[0].sets[0].id;
    updateSet(db, id, { weight: 50, weightUnit: 'lb', durationS: 90, distance: 2.5, distanceUnit: 'km' });
    updateSet(db, id, { weight: null, weightUnit: null });
    expect(view(db).exercises[0].sets[0]).toMatchObject({
      weight: null,
      weightUnit: null,
      durationS: 90,
      distance: 2.5,
      distanceUnit: 'km',
    });
  });

  it('does nothing with an empty patch', () => {
    const { db } = startPushA();
    const before = view(db).exercises[0].sets[0];
    updateSet(db, before.id, {});
    expect(view(db).exercises[0].sets[0]).toEqual(before);
  });

  it('keeps a ticked set ticked while its values are edited', () => {
    const { db } = startPushA();
    const id = view(db).exercises[0].sets[0].id;
    tickSet(db, id, { weight: 135, reps: 5, durationS: null, distance: null }, 'lb', NOW, 'mi');
    updateSet(db, id, { reps: 6 });
    expect(view(db).exercises[0].sets[0]).toMatchObject({ done: true, weight: 135, reps: 6 });
  });
});

describe('replaceExercise', () => {
  it('swaps the exercise, keeps the set count and blanks every set, rule and planned weight', () => {
    const db = seededDb();
    db.update(routineExercises)
      .set({ nextWeight: 185, nextWeightUnit: 'lb' })
      .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
      .run();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const bench = view(db).exercises[0];
    expect(bench).toMatchObject({ plannedWeight: 185, rule: { setCount: 4 } });
    expect(rawWorkoutExercise(db, bench.id).routineExerciseId).toBe(`${PUSH_A}:barbell-bench-press`);
    for (const s of bench.sets.slice(0, 2)) {
      tickSet(db, s.id, { weight: 185, reps: 5, durationS: null, distance: null }, 'lb', NOW, 'mi');
      db.update(sets).set({ rpe: 8, prFlags: 3 }).where(eq(sets.id, s.id)).run();
    }
    db.update(workoutExercises)
      .set({ overrideWeight: 190, overrideUnit: 'lb' })
      .where(eq(workoutExercises.id, bench.id))
      .run();

    replaceExercise(db, bench.id, 'dumbbell-bench-press');

    const replaced = view(db).exercises[0];
    expect(replaced).toMatchObject({
      id: bench.id,
      exerciseId: 'dumbbell-bench-press',
      name: 'Dumbbell bench press',
      position: 0,
      rule: null,
      plannedWeight: null,
      plannedUnit: null,
      overrideWeight: null,
      overrideUnit: null,
    });
    expect(replaced.sets).toHaveLength(4);
    expect(replaced.sets.map((s) => s.id)).toEqual(bench.sets.map((s) => s.id));
    for (const s of replaced.sets) {
      expect(s).toMatchObject({
        setType: 'working',
        weight: null,
        weightUnit: null,
        reps: null,
        rpe: null,
        durationS: null,
        distance: null,
        distanceUnit: null,
        done: false,
      });
    }
    const rows = db.select().from(sets).where(eq(sets.workoutExerciseId, bench.id)).all();
    expect(rows.map((r) => [r.prFlags, r.completedAt])).toEqual(Array(4).fill([0, null]));
    expect(replaced.sets.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    expect(rawWorkoutExercise(db, bench.id).routineExerciseId).toBeNull();
  });

  it('leaves the other exercises and the superset group alone', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[0]);
    const groupBefore = groups(db)[0];
    replaceExercise(db, ids[0], 'dumbbell-bench-press');
    expect(exerciseOrder(db)).toEqual(['dumbbell-bench-press', ...PUSH_A_ORDER.slice(1)]);
    expect(groups(db).slice(0, 2)).toEqual([groupBefore, groupBefore]);
    expect(view(db).exercises.map((e) => e.sets.length)).toEqual([4, 3, 3, 3, 3]);
    expect(view(db).exercises[1].rule).not.toBeNull();
  });
});

describe('addExerciseToWorkout', () => {
  it('appends the exercise with one blank working set and no rule', () => {
    const { db, workoutId } = startPushA();
    const id = addExerciseToWorkout(db, workoutId, 'face-pull');
    const v = view(db);
    expect(v.exercises).toHaveLength(6);
    const last = v.exercises[5];
    expect(last).toMatchObject({
      id,
      exerciseId: 'face-pull',
      name: 'Face pull',
      position: 5,
      supersetGroup: null,
      showRpe: false,
      rule: null,
      plannedWeight: null,
      plannedUnit: null,
      overrideWeight: null,
    });
    expect(last.sets).toHaveLength(1);
    expect(last.sets[0]).toMatchObject({ position: 0, setType: 'working', weight: null, reps: null, done: false });
    expect(db.select().from(workoutExercises).where(eq(workoutExercises.id, id)).get()!.routineExerciseId).toBeNull();
  });

  it('starts an empty workout at position 0 and appends after it', () => {
    const db = seededDb();
    const workoutId = startEmptyWorkout(db, NOW);
    addExerciseToWorkout(db, workoutId, 'face-pull');
    addExerciseToWorkout(db, workoutId, 'barbell-bench-press');
    expect(positions(db)).toEqual([0, 1]);
    expect(exerciseOrder(db)).toEqual(['face-pull', 'barbell-bench-press']);
  });
});

describe('removeExercise', () => {
  it('removes the exercise and its sets and renumbers the rest from 0', () => {
    const { db, ids } = startPushA();
    removeExercise(db, ids[1]);
    expect(exerciseOrder(db)).toEqual([
      'barbell-bench-press',
      'incline-dumbbell-press',
      'dumbbell-lateral-raise',
      'cable-triceps-pushdown',
    ]);
    expect(positions(db)).toEqual([0, 1, 2, 3]);
    expect(db.select().from(sets).where(eq(sets.workoutExerciseId, ids[1])).all()).toEqual([]);
    expect(db.select().from(workoutExercises).where(eq(workoutExercises.id, ids[1])).get()).toBeUndefined();
  });

  it('removes the first and the last exercise', () => {
    const { db, ids } = startPushA();
    removeExercise(db, ids[0]);
    removeExercise(db, ids[4]);
    expect(exerciseOrder(db)).toEqual(PUSH_A_ORDER.slice(1, 4));
    expect(positions(db)).toEqual([0, 1, 2]);
  });

  it('removes the last exercise of a workout', () => {
    const db = seededDb();
    const workoutId = startEmptyWorkout(db, NOW);
    const id = addExerciseToWorkout(db, workoutId, 'face-pull');
    removeExercise(db, id);
    expect(view(db).exercises).toEqual([]);
  });

  it('dissolves a superset left with one member and keeps a group that still has two', () => {
    const { db, ids } = startPushA();
    toggleSupersetWithNext(db, ids[0]);
    toggleSupersetWithNext(db, ids[1]);
    removeExercise(db, ids[2]);
    let g = groups(db);
    expect(g[0]).not.toBeNull();
    expect(g[1]).toBe(g[0]);

    removeExercise(db, ids[1]);
    g = groups(db);
    expect(g).toEqual([null, null, null]);
  });

  it('does not touch the sets of the other exercises', () => {
    const { db, ids } = startPushA();
    removeExercise(db, ids[0]);
    expect(view(db).exercises.map((e) => e.sets.length)).toEqual([3, 3, 3, 3]);
  });
});

describe('setShowRpe', () => {
  it('turns RPE on and off for one exercise', () => {
    const { db, ids } = startPushA();
    setShowRpe(db, ids[0], true);
    expect(view(db).exercises.map((e) => e.showRpe)).toEqual([true, false, false, false, false]);
    setShowRpe(db, ids[0], false);
    expect(view(db).exercises[0].showRpe).toBe(false);
  });
});
