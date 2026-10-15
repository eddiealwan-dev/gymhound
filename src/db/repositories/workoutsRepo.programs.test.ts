/** @jest-environment node */
// The workout engine for the twenty programs (spec §18.29, R610–R628): startWorkoutFromDay, storeOutcomes and
// finishWorkout on a program slot. The routine of the old kind keeps its own tests in workoutsRepo.test.ts.
import { asc, eq } from 'drizzle-orm';
import { routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import { fakeSessions, insertProgram, runSession } from '../testing/programFixture';
import type { Db } from '../types';
import { setActiveProgram } from './programRunRepo';
import { swapRoutineExercise } from './routinesRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';
import { discardWorkout, finishWorkout, startWorkoutFromDay } from './workoutsRepo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const at = (n: number) => NOW + n * DAY;

const BF = 'program-barbell-foundations';
const BF_A = `${BF}:a`;
const SQUAT_A = `${BF_A}:barbell-back-squat`;
const BENCH_A = `${BF_A}:barbell-bench-press`;
const SQUAT_B = `${BF}:b:barbell-back-squat`;

const slotRow = (db: Db, id: string) => db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;
const workoutRow = (db: Db, id: string) => db.select().from(workouts).where(eq(workouts.id, id)).get()!;
function blocksOf(db: Db, workoutId: string) {
  return db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
}
const blockOf = (db: Db, workoutId: string, routineExerciseId: string) =>
  blocksOf(db, workoutId).find((b) => b.routineExerciseId === routineExerciseId)!;
const setCountOf = (db: Db, workoutExerciseId: string) =>
  db.select().from(sets).where(eq(sets.workoutExerciseId, workoutExerciseId)).all().length;

describe('program weeks in a workout (R616, R617)', () => {
  it('week 10 of Upper/Lower Powerbuilding starts with half the sets and holds every weight', () => {
    const db = seededDb();
    const program = insertProgram(db, 'program-upper-lower-powerbuilding');
    setActiveProgram(db, program.id, NOW);
    fakeSessions(db, program.id, 9 * program.daysPerWeek, NOW + HOUR);
    const day = program.days[0];
    for (const slot of day.slots) {
      db.update(routineExercises).set({ nextWeight: 100, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, slot.id)).run();
    }

    const id = runSession(
      db,
      `${program.id}:${day.slug}`,
      at(30),
      Object.fromEntries(day.slots.map((s) => [s.id, { weight: 100, reps: [20, 20, 20, 20] }])),
      false,
    );
    expect(workoutRow(db, id)).toMatchObject({ programWeek: 10, weekKind: 'deload' });
    for (const slot of day.slots) {
      const block = blockOf(db, id, slot.id);
      expect(block.ruleSetCount).toBe(Math.ceil(slot.sets / 2));
      expect(setCountOf(db, block.id)).toBe(Math.ceil(slot.sets / 2));
    }

    finishWorkout(db, id, at(30) + HOUR);
    for (const slot of day.slots) {
      expect(blockOf(db, id, slot.id)).toMatchObject({ outcome: 'held_week', nextWeight: 100, missed: false });
      expect(slotRow(db, slot.id).nextWeight).toBe(100);
    }
  });

  it('a normal week snapshots the week with no kind, and the full set count', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    const id = startWorkoutFromDay(db, BF_A, at(1));
    expect(workoutRow(db, id)).toMatchObject({ programWeek: 1, weekKind: null });
    expect(blockOf(db, id, SQUAT_A)).toMatchObject({ ruleKind: 'load', ruleSetCount: 3, ruleRung: null, ruleIncrement: 5 });
  });
});

describe('misses, resets and halving (R612, R613)', () => {
  it("Barbell Foundations squat: 3 misses in a row → next time 90% rounded down; a marked session between them doesn't break or count", () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);

    const w1 = runSession(db, BF_A, at(1), { [SQUAT_A]: { weight: 135, reps: [5, 5, 4] } });
    expect(blockOf(db, w1, SQUAT_A)).toMatchObject({ outcome: 'held', missed: true, nextWeight: 135 });
    const w2 = runSession(db, BF_A, at(2), { [SQUAT_A]: { weight: 135, reps: [3, 3, 3], mark: 'pain' } });
    expect(blockOf(db, w2, SQUAT_A)).toMatchObject({ outcome: 'held_marked', missed: false, nextWeight: 135 });
    const w3 = runSession(db, BF_A, at(3), { [SQUAT_A]: { weight: 135, reps: [5, 4, 4] } });
    expect(blockOf(db, w3, SQUAT_A)).toMatchObject({ outcome: 'held', missed: true, nextWeight: 135 });
    expect(slotRow(db, SQUAT_A).nextWeight).toBe(135);

    const w4 = runSession(db, BF_A, at(4), { [SQUAT_A]: { weight: 135, reps: [5, 5, 3] } });
    // 135 × 0.9 = 121.5, down to what the plates load: 120.
    expect(blockOf(db, w4, SQUAT_A)).toMatchObject({ outcome: 'reset', missed: true, nextWeight: 120, nextUnit: 'lb' });
    expect(slotRow(db, SQUAT_A)).toMatchObject({ nextWeight: 120, nextWeightUnit: 'lb' });

    // The count starts again after a reset: the next miss holds.
    const w5 = runSession(db, BF_A, at(5), { [SQUAT_A]: { weight: 120, reps: [5, 5, 4] } });
    expect(blockOf(db, w5, SQUAT_A)).toMatchObject({ plannedWeight: 120, outcome: 'held', missed: true, nextWeight: 120 });
  });

  it('after the first miss the snapshot increment is 2.5 lb', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);

    runSession(db, BF_A, at(1), { [SQUAT_A]: { weight: 135, reps: [8, 8, 8] }, [BENCH_A]: { weight: 95, reps: [8, 8, 8] } });
    const before = startWorkoutFromDay(db, BF_A, at(2));
    expect(blockOf(db, before, SQUAT_A)).toMatchObject({ ruleIncrement: 5, plannedWeight: 140 });
    discardWorkout(db, before);

    runSession(db, BF_A, at(2), { [SQUAT_A]: { weight: 140, reps: [5, 5, 4] }, [BENCH_A]: { weight: 100, reps: [8, 8, 8] } });
    const after = startWorkoutFromDay(db, BF_A, at(3));
    expect(blockOf(db, after, SQUAT_A)).toMatchObject({ ruleIncrement: 2.5, ruleIncrementUnit: 'lb', plannedWeight: 140 });
    // Only the slot that missed: the bench and day B's squat keep 5 lb.
    expect(blockOf(db, after, BENCH_A)).toMatchObject({ ruleIncrement: 5 });
    discardWorkout(db, after);
    const dayB = startWorkoutFromDay(db, `${BF}:b`, at(3));
    expect(blockOf(db, dayB, SQUAT_B)).toMatchObject({ ruleIncrement: 5 });
  });

  it('a kg lifter halves to 1.25 kg and resets to a multiple of the full increment off a barbell', () => {
    const db = seededDb('metric');
    insertProgram(db, BF, 'kg');
    setActiveProgram(db, BF, NOW);
    const curl = `${BF_A}:dumbbell-curl`;
    for (let i = 1; i <= 3; i++) runSession(db, BF_A, at(i), { [curl]: { weight: 13, unit: 'kg', reps: [10, 10, 9] } });
    const id = startWorkoutFromDay(db, BF_A, at(4));
    // 13 × 0.9 = 11.7, down to a multiple of 2.5 kg: 10.
    expect(blockOf(db, id, curl)).toMatchObject({ ruleIncrement: 1.25, ruleIncrementUnit: 'kg', plannedWeight: 10, plannedUnit: 'kg' });
  });
});

describe('a Modify swap on a program slot (R553, R612, R613)', () => {
  it("after a swap, misses and halving count only the new exercise's sessions", () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    runSession(db, BF_A, at(1), { [SQUAT_A]: { weight: 135, reps: [5, 5, 4] } });
    runSession(db, BF_A, at(2), { [SQUAT_A]: { weight: 135, reps: [5, 5, 4] } });
    swapRoutineExercise(db, SQUAT_A, 'barbell-front-squat');

    const fresh = startWorkoutFromDay(db, BF_A, at(3));
    expect(blockOf(db, fresh, SQUAT_A)).toMatchObject({ exerciseId: 'barbell-front-squat', ruleIncrement: 5 });
    discardWorkout(db, fresh);
    // The back squat's two misses don't count: this is the front squat's first miss, so it holds.
    const w3 = runSession(db, BF_A, at(3), { [SQUAT_A]: { weight: 95, reps: [5, 5, 4] } });
    expect(blockOf(db, w3, SQUAT_A)).toMatchObject({ outcome: 'held', missed: true, nextWeight: 95 });
    const next = startWorkoutFromDay(db, BF_A, at(4));
    expect(blockOf(db, next, SQUAT_A)).toMatchObject({ ruleIncrement: 2.5 });
  });
});

describe('a carry in its slot unit (R607)', () => {
  it('a first Yoke carry is entered in ft', () => {
    const db = seededDb();
    const SM = 'program-strongman-prep';
    insertProgram(db, SM);
    setActiveProgram(db, SM, NOW);
    startWorkoutFromDay(db, `${SM}:thu-events-a`, at(1));
    const view = getActiveWorkoutView(db)!;
    expect(view.exercises.find((e) => e.exerciseId === 'yoke-carry')).toMatchObject({ slotDistanceUnit: 'ft' });
    // A slot that is not a carry has none.
    expect(view.exercises.find((e) => e.exerciseId !== 'yoke-carry')?.slotDistanceUnit ?? null).toBeNull();
  });
});

describe('ladders (R618)', () => {
  const CALI = 'program-calisthenics-foundations';
  const CALI_A = `${CALI}:a`;
  const SQUAT_LADDER = `${CALI_A}:assisted-squat`;
  const DIP_LADDER = `${CALI_A}:support-hold`;

  it('a ladder slot at 3×8 moves to the next rung and logs that exercise next time; two low sessions move it back', () => {
    const db = seededDb();
    const program = insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const ladder = program.days[0].slots.find((s) => s.id === SQUAT_LADDER)!.ladder!;

    const w1 = runSession(db, CALI_A, at(1), { [SQUAT_LADDER]: { reps: [8, 8, 8] } });
    expect(blockOf(db, w1, SQUAT_LADDER)).toMatchObject({ exerciseId: ladder[0].exerciseId, ruleRung: 0, nextRung: 1, outcome: 'raised' });
    expect(slotRow(db, SQUAT_LADDER)).toMatchObject({ ladderRung: 1, exerciseId: ladder[1].exerciseId });

    const w2 = runSession(db, CALI_A, at(2), { [SQUAT_LADDER]: { reps: [4, 6, 6] } });
    expect(blockOf(db, w2, SQUAT_LADDER)).toMatchObject({
      exerciseId: ladder[1].exerciseId,
      ruleRung: 1,
      ruleRepMin: ladder[1].repMin,
      ruleRepMax: ladder[1].repMax,
      nextRung: 1,
    });
    expect(slotRow(db, SQUAT_LADDER)).toMatchObject({ ladderRung: 1, exerciseId: ladder[1].exerciseId });

    const w3 = runSession(db, CALI_A, at(3), { [SQUAT_LADDER]: { reps: [4, 4, 4] } });
    expect(blockOf(db, w3, SQUAT_LADDER)).toMatchObject({ ruleRung: 1, nextRung: 0 });
    expect(slotRow(db, SQUAT_LADDER)).toMatchObject({ ladderRung: 0, exerciseId: ladder[0].exerciseId });
  });

  it("a hold rung runs its own range in seconds, not the slot's reps", () => {
    const db = seededDb();
    const program = insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const ladder = program.days[0].slots.find((s) => s.id === DIP_LADDER)!.ladder!;
    expect(ladder[0]).toMatchObject({ timed: true, repMin: 10, repMax: 30 });

    const w1 = runSession(db, CALI_A, at(1), { [DIP_LADDER]: { seconds: [30, 30, 30] } });
    expect(blockOf(db, w1, DIP_LADDER)).toMatchObject({ ruleRepMin: 10, ruleRepMax: 30, ruleIncrement: 0, nextRung: 1 });
    expect(slotRow(db, DIP_LADDER)).toMatchObject({ ladderRung: 1, exerciseId: ladder[1].exerciseId });
  });

  it('a marked session on a ladder holds the rung and does not count as low', () => {
    const db = seededDb();
    insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    runSession(db, CALI_A, at(1), { [SQUAT_LADDER]: { reps: [8, 8, 8] } });
    runSession(db, CALI_A, at(2), { [SQUAT_LADDER]: { reps: [4, 4, 4] } });
    const w3 = runSession(db, CALI_A, at(3), { [SQUAT_LADDER]: { reps: [2, 2, 2], mark: 'sick' } });
    expect(blockOf(db, w3, SQUAT_LADDER)).toMatchObject({ outcome: 'held_marked', nextRung: 1 });
    const w4 = runSession(db, CALI_A, at(4), { [SQUAT_LADDER]: { reps: [4, 4, 4] } });
    expect(blockOf(db, w4, SQUAT_LADDER)).toMatchObject({ nextRung: 0 });
  });
});

describe('added sets (R619)', () => {
  it('Armor Building Complex adds a set each completed session to 8, then +4 kg and back to 5', () => {
    const db = seededDb('metric');
    const KB = 'program-kettlebell-strength-conditioning';
    const program = insertProgram(db, KB, 'kg');
    setActiveProgram(db, KB, NOW);
    const day = program.days.find((d) => d.slug === 'c-complex')!;
    const dayId = `${KB}:${day.slug}`;
    const complex = day.slots[0].id;

    const w1 = runSession(db, dayId, at(1), { [complex]: { weight: 16, unit: 'kg', reps: [2, 2, 2, 2, 2] } });
    expect(blockOf(db, w1, complex)).toMatchObject({ ruleKind: 'add_set', ruleSetCount: 5, nextSetCount: 6, nextWeight: 16 });
    expect(slotRow(db, complex)).toMatchObject({ nextSetCount: 6, nextWeight: 16, nextWeightUnit: 'kg' });

    // One set short holds the count.
    const short = runSession(db, dayId, at(2), { [complex]: { weight: 16, unit: 'kg', reps: [2, 2, 2, 2, 2] } });
    expect(blockOf(db, short, complex)).toMatchObject({ ruleSetCount: 6, nextSetCount: 6, nextWeight: 16 });

    const w3 = runSession(db, dayId, at(3), { [complex]: { weight: 16, unit: 'kg', reps: [2, 2, 2, 2, 2, 2] } });
    expect(blockOf(db, w3, complex)).toMatchObject({ ruleSetCount: 6, nextSetCount: 7 });
    const w4 = runSession(db, dayId, at(4), { [complex]: { weight: 16, unit: 'kg', reps: [2, 2, 2, 2, 2, 2, 2] } });
    expect(blockOf(db, w4, complex)).toMatchObject({ ruleSetCount: 7, nextSetCount: 8 });
    const w5 = runSession(db, dayId, at(5), { [complex]: { weight: 16, unit: 'kg', reps: [2, 2, 2, 2, 2, 2, 2, 2] } });
    expect(blockOf(db, w5, complex)).toMatchObject({ ruleSetCount: 8, outcome: 'raised', nextWeight: 20, nextUnit: 'kg', nextSetCount: 5 });
    expect(slotRow(db, complex)).toMatchObject({ nextSetCount: 5, nextWeight: 20 });

    const next = startWorkoutFromDay(db, dayId, at(6));
    const block = blockOf(db, next, complex);
    expect(block).toMatchObject({ ruleSetCount: 5, plannedWeight: 20, plannedUnit: 'kg' });
    expect(setCountOf(db, block.id)).toBe(5);
  });

  it('Bike intervals add a set to 8, then 5 s a set', () => {
    const db = seededDb();
    const LEAN = 'program-lean-out';
    const program = insertProgram(db, LEAN);
    setActiveProgram(db, LEAN, NOW);
    const day = program.days.find((d) => d.slots.some((s) => s.exerciseId === 'bike-intervals'))!;
    const dayId = `${LEAN}:${day.slug}`;
    const bike = day.slots.find((s) => s.exerciseId === 'bike-intervals')!.id;
    const secondsTimes = (n: number, s: number) => Array<number>(n).fill(s);

    runSession(db, dayId, at(1), { [bike]: { seconds: secondsTimes(6, 30) } });
    runSession(db, dayId, at(2), { [bike]: { seconds: secondsTimes(7, 30) } });
    const atCap = runSession(db, dayId, at(3), { [bike]: { seconds: secondsTimes(8, 30) } });
    expect(blockOf(db, atCap, bike)).toMatchObject({ ruleSetCount: 8, ruleRepMin: 30, nextSetCount: 8, outcome: 'raised' });
    const next = startWorkoutFromDay(db, dayId, at(4));
    expect(blockOf(db, next, bike)).toMatchObject({ ruleSetCount: 8, ruleRepMin: 35, ruleRepMax: 35 });
  });
});

describe('runs (R620)', () => {
  const HYBRID = 'program-hybrid-athlete';

  it('Hybrid Athlete week 4 runs are 60% and lifts half', () => {
    const db = seededDb();
    const program = insertProgram(db, HYBRID);
    setActiveProgram(db, HYBRID, NOW);
    fakeSessions(db, HYBRID, 3 * program.daysPerWeek, NOW + HOUR);

    const tue = program.days.find((d) => d.slug === 'tue-upper-strength-easy-run')!;
    const lifts = startWorkoutFromDay(db, `${HYBRID}:${tue.slug}`, at(20));
    expect(workoutRow(db, lifts)).toMatchObject({ programWeek: 4, weekKind: 'lighter' });
    const bench = tue.slots[0];
    expect(blockOf(db, lifts, bench.id)).toMatchObject({ ruleSetCount: Math.ceil(bench.sets / 2) });
    // Easy run: 1,500 s + 3 × 120 s = 1,860 s, at 60%: 1,116 s.
    expect(blockOf(db, lifts, `${HYBRID}:${tue.slug}:easy-run`)).toMatchObject({
      ruleKind: 'weekly_seconds',
      ruleSetCount: 1,
      ruleRepMin: 1116,
      ruleRepMax: 1116,
      ruleIncrement: 0,
    });
    discardWorkout(db, lifts);

    const wed = `${HYBRID}:wed-intervals`;
    const runs = startWorkoutFromDay(db, wed, at(21));
    // Intervals: 6 + 3 sets capped at 8, so one week at the cap adds 15 s: 195 s, at 60%: 117 s. The warm-up and
    // cool-down jogs stay fixed.
    expect(blockOf(db, runs, `${wed}:interval-run`)).toMatchObject({ ruleSetCount: 8, ruleRepMin: 117, ruleRepMax: 117 });
    expect(blockOf(db, runs, `${wed}:easy-run`)).toMatchObject({ ruleSetCount: 1, ruleRepMin: 600 });
    expect(blockOf(db, runs, `${wed}:easy-run@2`)).toMatchObject({ ruleSetCount: 1, ruleRepMin: 600 });
  });

  it('a run in week 1 is its start time, and finishing it is no miss', () => {
    const db = seededDb();
    insertProgram(db, HYBRID);
    setActiveProgram(db, HYBRID, NOW);
    const slot = `${HYBRID}:sat-long-run:long-run`;
    const id = runSession(db, `${HYBRID}:sat-long-run`, at(1), { [slot]: { seconds: [1200] } });
    expect(blockOf(db, id, slot)).toMatchObject({ ruleRepMin: 3600, ruleRepMax: 3600, missed: false, outcome: 'no_rule' });
  });
});

describe('your own routine (R628)', () => {
  it('your own routine still runs plain §7.3', () => {
    const db = seededDb();
    db.insert(routines).values({ id: 'mine', name: 'Mine', isPremade: false, nextDayIndex: 0, createdAt: NOW }).run();
    db.insert(routineDays).values({ id: 'mine-a', routineId: 'mine', name: 'A', position: 0 }).run();
    db.insert(routineExercises)
      .values({
        id: 'mine-bench',
        routineDayId: 'mine-a',
        exerciseId: 'barbell-bench-press',
        position: 0,
        setCount: 3,
        repMin: 5,
        repMax: 8,
        increment: 5,
        incrementUnit: 'lb',
      })
      .run();
    setActiveProgram(db, 'mine', NOW);
    expect(db.select().from(routines).where(eq(routines.id, 'mine')).get()!.runStartedAt).toBeNull();

    for (let i = 1; i <= 4; i++) {
      const id = runSession(db, 'mine-a', at(i), { 'mine-bench': { weight: 135, reps: [5, 5, 4] } });
      expect(workoutRow(db, id)).toMatchObject({ programWeek: null, weekKind: null });
      expect(blockOf(db, id, 'mine-bench')).toMatchObject({
        ruleKind: null,
        ruleRung: null,
        ruleIncrement: 5,
        outcome: 'held',
        missed: false,
        nextWeight: 135,
        nextSetCount: null,
        nextRung: null,
      });
    }
    expect(slotRow(db, 'mine-bench')).toMatchObject({ nextWeight: 135, ladderRung: null, nextSetCount: null });
  });
});
