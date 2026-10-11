/** @jest-environment node */
import { eq, inArray } from 'drizzle-orm';
import { PR_BIT } from '../../domain/prs';
import { sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { backfillPrFlags, getWorkoutPrs, recomputePrFlags, tryBackfillPrFlags, writePrFlags } from './prRepo';
import { getSettings, setSetting } from './settingsRepo';
import { addExerciseToWorkout, addSet, updateSet } from './workoutEditRepo';
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

describe('first session with warm-ups only before it (R103)', () => {
  it('a workout whose only earlier bench sets were warm-ups is still the first session', () => {
    const db = seededDb();
    const warmups = workout(db, OCT_1, [[BENCH, [lb(45, 10), lb(95, 5)]]], false);
    warmups.sets[0].forEach((id) => updateSet(db, id, { setType: 'warmup' }));
    finishWorkout(db, warmups.id, OCT_1 + 60 * MINUTE);
    const second = workout(db, OCT_1 + DAY, [[BENCH, [lb(135, 5)]]]);
    const third = workout(db, OCT_1 + 2 * DAY, [[BENCH, [lb(140, 5)]]]);

    expect(flagsOf(db, warmups.sets[0])).toEqual([0, 0]);
    expect(flagsOf(db, second.sets[0])).toEqual([0]);
    expect(getWorkoutPrs(db, second.id)).toEqual([]);
    expect(flagsOf(db, third.sets[0])).toEqual([HEAVIEST | E1RM]);
  });
});

describe('backfillPrFlags: workouts finished before phase 4 (R127)', () => {
  /** A phase 3 history: two finished workouts with no flags written, and the backfill not yet run. */
  function phase3History(db: Db) {
    const first = workout(db, OCT_1, [
      [BENCH, [lb(135, 5)]],
      [PLANK, [hold(40)]],
    ]);
    const second = workout(db, OCT_1 + DAY, [
      [BENCH, [lb(140, 5)]],
      [PLANK, [hold(45)]],
    ]);
    db.update(sets).set({ prFlags: 0 }).run();
    setSetting(db, 'prFlagsBackfilled', false);
    return { first, second };
  }

  it('fills the flags of every exercise in a finished workout once, then sets the flag', () => {
    const db = seededDb();
    const { first, second } = phase3History(db);

    expect(backfillPrFlags(db)).toBe(2);

    expect(flagsOf(db, first.sets.flat())).toEqual([0, 0]);
    expect(flagsOf(db, second.sets.flat())).toEqual([HEAVIEST | E1RM, PR_BIT.longest_hold]);
    expect(getSettings(db).prFlagsBackfilled).toBe(true);
  });

  it('does not run a second time', () => {
    const db = seededDb();
    const { second } = phase3History(db);
    backfillPrFlags(db);
    db.update(sets).set({ prFlags: 0 }).run();

    expect(backfillPrFlags(db)).toBe(0);
    expect(flagsOf(db, second.sets.flat())).toEqual([0, 0]);
  });

  it('leaves the active workout out', () => {
    const db = seededDb();
    phase3History(db);
    const active = workout(db, OCT_1 + 2 * DAY, [[BENCH, [lb(150, 5)]]], false);

    expect(backfillPrFlags(db)).toBe(2);
    expect(flagsOf(db, active.sets[0])).toEqual([0]);
  });

  it('on a fresh install sets the flag without recomputing anything', () => {
    const db = seededDb();
    expect(getSettings(db).prFlagsBackfilled).toBe(false);

    expect(backfillPrFlags(db)).toBe(0);
    expect(getSettings(db).prFlagsBackfilled).toBe(true);
  });

  it('fills a big history quickly, in batches', () => {
    const db = seededDb();
    // 200 workouts of 10 bench sets each, rising 1 lb a workout: every set after the first workout's is a PR.
    for (let w = 0; w < 200; w++) {
      const id = `w${w}`;
      const started = OCT_1 + w * DAY;
      db.insert(workouts).values({ id, name: 'Bench', status: 'finished', startedAt: started, finishedAt: started + 60 * MINUTE, localDate: '2026-10-01' }).run();
      db.insert(workoutExercises).values({ id: `${id}-we`, workoutId: id, exerciseId: BENCH, position: 0, showRpe: false }).run();
      db.insert(sets)
        .values(
          Array.from({ length: 10 }, (_, i) => ({
            id: `${id}-s${i}`,
            workoutExerciseId: `${id}-we`,
            position: i,
            setType: 'working' as const,
            weight: 100 + w,
            weightUnit: 'lb' as const,
            reps: 5,
            done: true,
            completedAt: started + i * MINUTE,
          })),
        )
        .run();
    }
    setSetting(db, 'prFlagsBackfilled', false);

    const t = Date.now();
    expect(backfillPrFlags(db)).toBe(1);
    expect(Date.now() - t).toBeLessThan(2000);

    const flagged = db.select({ prFlags: sets.prFlags }).from(sets).all().filter((r) => r.prFlags !== 0);
    // The first set of each later workout is heavier than everything before it.
    expect(flagged).toHaveLength(199);
  });
});

describe('tryBackfillPrFlags: the launch never stops on the backfill (R127)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs a failed backfill and carries on, leaving the flag off so the next launch tries again', () => {
    const db = seededDb();
    setSetting(db, 'prFlagsBackfilled', false);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const transaction = jest.spyOn(db, 'transaction').mockImplementation(() => {
      throw new Error('disk I/O error');
    });

    expect(() => tryBackfillPrFlags(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(getSettings(db).prFlagsBackfilled).toBe(false);

    transaction.mockRestore();
    tryBackfillPrFlags(db);
    expect(getSettings(db).prFlagsBackfilled).toBe(true);
  });
});
