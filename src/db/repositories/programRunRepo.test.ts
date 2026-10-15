/** @jest-environment node */
import { asc, eq } from 'drizzle-orm';
import { routineExercises, routines, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import { fakeSessions, insertProgram, runSession } from '../testing/programFixture';
import type { Db } from '../types';
import { changeRung, programState, setActiveProgram, startEarlyDeload, startProgramOver } from './programRunRepo';
import { getSettings } from './settingsRepo';
import { discardWorkout, startWorkoutFromDay } from './workoutsRepo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();

const BF = 'program-barbell-foundations';
const BF_A = `${BF}:a`;
const BF_SQUAT_A = `${BF_A}:barbell-back-squat`;
const DUP = 'program-advanced-upper-lower-dup';
const CALI = 'program-calisthenics-foundations';
const CALI_SQUAT = `${CALI}:a:assisted-squat`;

const routineRow = (db: Db, id: string) => db.select().from(routines).where(eq(routines.id, id)).get()!;
const slotRow = (db: Db, id: string) => db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;
function blocksOf(db: Db, workoutId: string) {
  return db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
}

describe('setActiveProgram (R636, R616)', () => {
  it('setActiveProgram starts week 1 once; switching away and back continues', () => {
    const db = seededDb();
    const program = insertProgram(db, BF);
    expect(programState(db, BF)).toBeNull();

    setActiveProgram(db, BF, NOW);
    expect(getSettings(db).activeRoutineId).toBe(BF);
    expect(routineRow(db, BF).runStartedAt).toBe(NOW);
    expect(programState(db, BF)).toMatchObject({ week: 1, sessions: 0, weekInfo: null, done: false });

    fakeSessions(db, BF, program.daysPerWeek, NOW + HOUR);
    expect(programState(db, BF)).toMatchObject({ week: 2, sessions: 3 });

    // Away to a routine of the old kind, which gets no run, and back: the run continues.
    setActiveProgram(db, 'premade-ppl-6', NOW + DAY);
    expect(getSettings(db).activeRoutineId).toBe('premade-ppl-6');
    expect(routineRow(db, 'premade-ppl-6').runStartedAt).toBeNull();
    expect(programState(db, 'premade-ppl-6')).toBeNull();
    setActiveProgram(db, BF, NOW + 2 * DAY);
    expect(routineRow(db, BF).runStartedAt).toBe(NOW);
    expect(programState(db, BF)).toMatchObject({ week: 2, sessions: 3 });

    setActiveProgram(db, null, NOW + 3 * DAY);
    expect(getSettings(db).activeRoutineId).toBeNull();
    expect(routineRow(db, BF).runStartedAt).toBe(NOW);
  });

  it('counts only the sessions since the run started, and reads "done" after the last week', () => {
    const db = seededDb();
    const program = insertProgram(db, BF);
    fakeSessions(db, BF, 2, NOW - DAY);
    setActiveProgram(db, BF, NOW);
    expect(programState(db, BF)).toMatchObject({ week: 1, sessions: 0 });
    fakeSessions(db, BF, program.weeks * program.daysPerWeek, NOW + HOUR);
    expect(programState(db, BF)).toMatchObject({ week: program.weeks + 1, weekInfo: null, done: true });
  });
});

describe('startProgramOver (R616)', () => {
  it('Start over clears halving and starts week 1, weights kept', () => {
    const db = seededDb();
    insertProgram(db, BF);
    setActiveProgram(db, BF, NOW);
    fakeSessions(db, BF, 4, NOW + HOUR);
    // One miss on the squat: 4 reps on the last set.
    runSession(db, BF_A, NOW + DAY, { [BF_SQUAT_A]: { weight: 135, reps: [5, 5, 4] } });
    expect(slotRow(db, BF_SQUAT_A).nextWeight).toBe(135);
    expect(programState(db, BF)).toMatchObject({ week: 2, sessions: 5 });

    const halved = startWorkoutFromDay(db, BF_A, NOW + 2 * DAY);
    expect(blocksOf(db, halved)[0]).toMatchObject({ ruleIncrement: 2.5, plannedWeight: 135 });
    discardWorkout(db, halved);

    startProgramOver(db, BF, NOW + 3 * DAY);
    expect(routineRow(db, BF)).toMatchObject({ runStartedAt: NOW + 3 * DAY, runDeloadAt: null });
    expect(programState(db, BF)).toMatchObject({ week: 1, sessions: 0, done: false });
    const fresh = startWorkoutFromDay(db, BF_A, NOW + 4 * DAY);
    expect(blocksOf(db, fresh)[0]).toMatchObject({ ruleIncrement: 5, plannedWeight: 135 });
    expect(db.select().from(workouts).where(eq(workouts.id, fresh)).get()).toMatchObject({ programWeek: 1, weekKind: null });
  });
});

describe('the reactive deload (R627)', () => {
  it('the reactive deload makes the next four sessions half and ends the block', () => {
    const db = seededDb();
    const program = insertProgram(db, DUP);
    setActiveProgram(db, DUP, NOW);
    const [upper, lower] = program.days;
    const benchSlot = upper.slots[0];
    const squatSlot = lower.slots[0];

    // Week 1: the bench and the squat, each day's main lift, both miss.
    runSession(db, `${DUP}:${upper.slug}`, NOW + HOUR, { [benchSlot.id]: { weight: 185, reps: [3, 3, 3, 3] } });
    expect(programState(db, DUP)).toMatchObject({ week: 1, mainMissesThisWeek: 1 });
    runSession(db, `${DUP}:${lower.slug}`, NOW + DAY, { [squatSlot.id]: { weight: 225, reps: [3, 3, 3, 3] } });
    expect(programState(db, DUP)).toMatchObject({ week: 1, sessions: 2, mainMissesThisWeek: 2, done: false });

    startEarlyDeload(db, DUP);
    expect(routineRow(db, DUP).runDeloadAt).toBe(2);
    expect(programState(db, DUP)).toMatchObject({ weekInfo: { kind: 'deload', halfSets: true }, done: false });

    program.days.forEach((day, i) => {
      const at = NOW + (2 + i) * DAY;
      const main = day.slots[0];
      const id = runSession(db, `${DUP}:${day.slug}`, at, { [main.id]: { weight: 100, reps: [12, 12] } });
      expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({ weekKind: 'deload' });
      const [block] = blocksOf(db, id);
      expect(block).toMatchObject({ ruleSetCount: Math.ceil(main.sets / 2), outcome: 'held_week', missed: false });
    });

    expect(programState(db, DUP)).toMatchObject({ sessions: 6, weekInfo: null, done: true });
  });
});

describe('changeRung (R618)', () => {
  it('moves a ladder slot to the rung, logs its exercise next time and clears the old rung weight', () => {
    const db = seededDb();
    const program = insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const ladder = program.days[0].slots.find((s) => s.id === CALI_SQUAT)!.ladder!;

    changeRung(db, CALI_SQUAT, 2);
    expect(slotRow(db, CALI_SQUAT)).toMatchObject({ ladderRung: 2, exerciseId: ladder[2].exerciseId, nextWeight: null });
    const id = startWorkoutFromDay(db, `${CALI}:a`, NOW + HOUR);
    expect(blocksOf(db, id).find((b) => b.routineExerciseId === CALI_SQUAT)).toMatchObject({
      exerciseId: ladder[2].exerciseId,
      ruleKind: 'ladder',
      ruleRung: 2,
    });
  });

  it('refuses a rung the ladder does not have, and a slot that is not a ladder', () => {
    const db = seededDb();
    insertProgram(db, CALI);
    expect(() => changeRung(db, CALI_SQUAT, 99)).toThrow();
    expect(() => changeRung(db, `${CALI}:a:fedb-band-pull-apart`, 1)).toThrow();
  });
});
