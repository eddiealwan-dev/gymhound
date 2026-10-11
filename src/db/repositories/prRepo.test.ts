/** @jest-environment node */
import { eq, inArray } from 'drizzle-orm';
import { PR_BIT } from '../../domain/prs';
import { sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getWorkoutPrs, recomputePrFlags, writePrFlags } from './prRepo';
import { addExerciseToWorkout, addSet } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = 'barbell-bench-press';
const PLANK = 'plank';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OCT_1 = new Date(2026, 9, 1, 9, 0).getTime();

const HEAVIEST = PR_BIT.heaviest;
const E1RM = PR_BIT.e1rm;

/** A lift: weight × reps in `unit`, or a hold of `durationS` seconds. */
type Lift = { weight?: number; unit?: 'lb' | 'kg'; reps?: number; durationS?: number };
const lb = (weight: number, reps: number): Lift => ({ weight, unit: 'lb', reps });
const kg = (weight: number, reps: number): Lift => ({ weight, unit: 'kg', reps });
const hold = (durationS: number): Lift => ({ durationS });

/** Ticks the set with `lift` at `at`. */
function tick(db: Db, setId: string, lift: Lift, at: number): void {
  tickSet(
    db,
    setId,
    { weight: lift.weight ?? null, reps: lift.reps ?? null, durationS: lift.durationS ?? null, distance: null },
    lift.unit ?? 'lb',
    at,
    'mi',
  );
}

/**
 * Starts an empty workout at `start` with one block per entry, ticks each block's lifts a minute apart in order, and
 * finishes it an hour later unless `finish` is false. Returns the workout id and the set ids, block by block.
 */
function workout(
  db: Db,
  start: number,
  blocks: [exerciseId: string, lifts: Lift[]][],
  finish = true,
): { id: string; sets: string[][] } {
  const id = startEmptyWorkout(db, start);
  const ids: string[][] = [];
  let at = start;
  for (const [exerciseId, lifts] of blocks) {
    const weId = addExerciseToWorkout(db, id, exerciseId);
    for (let i = 1; i < lifts.length; i++) addSet(db, weId);
    const blockSets = getActiveWorkoutView(db)!.exercises.find((e) => e.id === weId)!.sets.map((s) => s.id);
    lifts.forEach((lift, i) => tick(db, blockSets[i], lift, (at += MINUTE)));
    ids.push(blockSets);
  }
  if (finish) finishWorkout(db, id, start + 60 * MINUTE);
  return { id, sets: ids };
}

/** The stored flags of the sets, in the order given. */
function flagsOf(db: Db, ids: string[]): number[] {
  const rows = db.select({ id: sets.id, prFlags: sets.prFlags }).from(sets).where(inArray(sets.id, ids)).all();
  const byId = new Map(rows.map((r) => [r.id, r.prFlags]));
  return ids.map((id) => byId.get(id)!);
}

describe('writePrFlags at finish (7.6, R103)', () => {
  it('flags nothing on the first workout with the exercise', () => {
    const db = seededDb();
    const first = workout(db, OCT_1, [[BENCH, [lb(135, 5), lb(140, 5)]]]);

    expect(flagsOf(db, first.sets[0])).toEqual([0, 0]);
    expect(getWorkoutPrs(db, first.id)).toEqual([]);
  });

  it('flags a heavier bench on the second Push A, and lists it as a personal best', () => {
    const db = seededDb();
    const startPushA = (at: number, lifts: Lift[]) => {
      const id = startWorkoutFromDay(db, PUSH_A, at);
      const bench = getActiveWorkoutView(db)!.exercises[0].sets.map((s) => s.id);
      lifts.forEach((l, i) => tick(db, bench[i], l, at + (i + 1) * MINUTE));
      finishWorkout(db, id, at + 60 * MINUTE);
      return { id, bench };
    };
    startPushA(OCT_1, [lb(135, 5)]);
    const second = startPushA(OCT_1 + 3 * DAY, [lb(140, 5)]);

    const [flags] = flagsOf(db, [second.bench[0]]);
    expect(flags & HEAVIEST).toBe(HEAVIEST);
    expect(flags).toBe(HEAVIEST | E1RM);
    const prs = getWorkoutPrs(db, second.id);
    expect(prs.filter((p) => p.kind === 'heaviest')).toEqual([
      {
        exerciseId: BENCH,
        name: 'Barbell bench press',
        loggingType: 'weighted',
        kind: 'heaviest',
        weight: 140,
        weightUnit: 'lb',
        reps: 5,
        durationS: null,
        localDate: '2026-10-04',
      },
    ]);
    expect(prs.map((p) => p.kind)).toEqual(['heaviest', 'e1rm']);
  });

  it("leaves a finished workout's flags alone while a later workout is still active", () => {
    const db = seededDb();
    workout(db, OCT_1, [[BENCH, [lb(135, 5)]]]);
    const second = workout(db, OCT_1 + DAY, [[BENCH, [lb(140, 5)]]]);
    const active = workout(db, OCT_1 + 2 * DAY, [[BENCH, [lb(150, 5)]]], false);

    recomputePrFlags(db, [BENCH]);

    expect(flagsOf(db, second.sets[0])).toEqual([HEAVIEST | E1RM]);
    expect(flagsOf(db, active.sets[0])).toEqual([0]);
  });

  it('flags only the exercises of the finished workout, each by its own history', () => {
    const db = seededDb();
    workout(db, OCT_1, [
      [BENCH, [lb(135, 5)]],
      [PLANK, [hold(40)]],
    ]);
    const second = workout(db, OCT_1 + DAY, [
      [PLANK, [hold(45)]],
      [BENCH, [lb(135, 5)]],
    ]);

    expect(flagsOf(db, second.sets[0])).toEqual([PR_BIT.longest_hold]);
    expect(flagsOf(db, second.sets[1])).toEqual([0]);
    expect(getWorkoutPrs(db, second.id).map((p) => [p.name, p.kind, p.durationS])).toEqual([['Plank', 'longest_hold', 45]]);
  });
});

describe('recomputePrFlags: time order (R103)', () => {
  it('orders workouts by when they started, not when they finished', () => {
    const db = seededDb();
    // Logged in this order: Oct 6 first, then Oct 1 entered afterwards.
    const oct6 = workout(db, OCT_1 + 5 * DAY, [[BENCH, [kg(60, 5)]]]);
    expect(flagsOf(db, oct6.sets[0])).toEqual([0]);
    const oct1 = workout(db, OCT_1, [[BENCH, [lb(100, 5)]]]);

    // Oct 1 is now the first session; 60 kg on Oct 6 (132.3 lb) beats it.
    expect(flagsOf(db, oct1.sets[0])).toEqual([0]);
    expect(flagsOf(db, oct6.sets[0])).toEqual([HEAVIEST | E1RM]);
  });

  it('orders the sets of a workout by when they were ticked', () => {
    const db = seededDb();
    workout(db, OCT_1, [[BENCH, [lb(135, 5)]]]);
    const second = workout(db, OCT_1 + DAY, [[BENCH, [lb(140, 5), lb(145, 5)]]], false);
    const [first, last] = second.sets[0];
    // The second set was ticked first.
    db.update(sets).set({ completedAt: OCT_1 + DAY + 30 * MINUTE }).where(eq(sets.id, first)).run();
    finishWorkout(db, second.id, OCT_1 + DAY + 60 * MINUTE);

    // 145 came first and beat 135; 140 came after 145 and did not beat it.
    expect(flagsOf(db, [first, last])).toEqual([0, HEAVIEST | E1RM]);
  });

  it('puts a done set with no tick time after the ticked ones, then by position', () => {
    const db = seededDb();
    workout(db, OCT_1, [[BENCH, [lb(135, 5)]]]);
    const second = workout(db, OCT_1 + DAY, [[BENCH, [lb(145, 5), lb(140, 5)]]]);
    const [first, last] = second.sets[0];
    db.update(sets).set({ completedAt: null }).where(eq(sets.id, first)).run();

    recomputePrFlags(db, [BENCH]);

    // 140 is first in time and beats 135; 145, with no tick time, comes after and beats 140.
    expect(flagsOf(db, [first, last])).toEqual([HEAVIEST | E1RM, HEAVIEST | E1RM]);
  });

  it('orders the blocks of a workout by position when the tick times are the same', () => {
    const db = seededDb();
    workout(db, OCT_1, [[BENCH, [lb(135, 5)]]]);
    const second = workout(db, OCT_1 + DAY, [
      [BENCH, [lb(140, 5)]],
      [BENCH, [lb(140, 5)]],
    ]);
    const [a, b] = second.sets.map((s) => s[0]);
    db.update(sets).set({ completedAt: OCT_1 + DAY + MINUTE }).where(inArray(sets.id, [a, b])).run();

    recomputePrFlags(db, [BENCH]);

    expect(flagsOf(db, [a, b])).toEqual([HEAVIEST | E1RM, 0]);
  });

  it('clears flags that no longer hold', () => {
    const db = seededDb();
    const first = workout(db, OCT_1, [[BENCH, [lb(135, 5)]]]);
    db.update(sets).set({ prFlags: 15 }).where(eq(sets.id, first.sets[0][0])).run();

    recomputePrFlags(db, [BENCH]);

    expect(flagsOf(db, first.sets[0])).toEqual([0]);
  });

  it("uses the exercise's logging type", () => {
    const db = seededDb();
    workout(db, OCT_1, [[PLANK, [hold(40)]]]);
    const second = workout(db, OCT_1 + DAY, [[PLANK, [hold(50)]]]);

    expect(flagsOf(db, second.sets[0])).toEqual([PR_BIT.longest_hold]);
  });

  it('does nothing for no exercises, or one never logged', () => {
    const db = seededDb();
    expect(() => recomputePrFlags(db, [])).not.toThrow();
    expect(() => recomputePrFlags(db, ['no-such-exercise'])).not.toThrow();
  });
});

describe('getWorkoutPrs (R105)', () => {
  it('lists exercises in workout order, one highlight per kind, an exercise done twice once', () => {
    const db = seededDb();
    workout(db, OCT_1, [
      [PLANK, [hold(40)]],
      [BENCH, [lb(135, 5)]],
    ]);
    const second = workout(db, OCT_1 + DAY, [
      [BENCH, [lb(140, 5)]],
      [PLANK, [hold(45)]],
      [BENCH, [lb(145, 3)]],
    ]);

    expect(getWorkoutPrs(db, second.id).map((p) => [p.exerciseId, p.kind, p.weight, p.reps, p.durationS])).toEqual([
      [BENCH, 'heaviest', 145, 3, null],
      [BENCH, 'e1rm', 140, 5, null],
      [PLANK, 'longest_hold', null, null, 45],
    ]);
  });

  it('is empty for a workout that does not exist', () => {
    expect(getWorkoutPrs(seededDb(), 'missing')).toEqual([]);
  });

  it("writePrFlags is a no-op for a workout that isn't there", () => {
    const db = seededDb();
    expect(() => writePrFlags(db, 'missing')).not.toThrow();
    expect(db.select().from(workouts).all()).toEqual([]);
    expect(db.select().from(workoutExercises).all()).toEqual([]);
  });
});
