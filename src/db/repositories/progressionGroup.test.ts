/** @jest-environment node */
// One progression for the same lift on different days of a program (spec R625 as amended by ruling R-w1): the same
// exercise with the same range, target unit and rule kind shares its next weight, misses, halving, resets, rung and
// added sets across days. Slots whose range or kind differ stay independent; your own routines are unchanged (R628).
import { asc, eq } from 'drizzle-orm';
import { patchDraftSet } from '../../domain/historyDraft';
import { gearFor } from '../../domain/plates';
import { programTodaysRead } from '../../domain/ruleLine';
import { exercises, routineDays, routineExercises, routines, workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import { insertProgram, runSession } from '../testing/programFixture';
import type { Db } from '../types';
import { changeRung, progressionGroup, setActiveProgram } from './programRunRepo';
import { programPageOf } from './programViewRepo';
import { getUpNext, swapRoutineExercise } from './routinesRepo';
import { getSettings, setSetting } from './settingsRepo';
import { deleteFinishedWorkout, loadWorkoutDraft, saveWorkoutEdit } from './workoutHistoryRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';
import { discardWorkout, startWorkoutFromDay } from './workoutsRepo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const at = (n: number) => NOW + n * DAY;

const BF = 'program-barbell-foundations';
const BF_A = `${BF}:a`;
const BF_B = `${BF}:b`;
const SQUAT_A = `${BF_A}:barbell-back-squat`;
const SQUAT_B = `${BF_B}:barbell-back-squat`;

const slotRow = (db: Db, id: string) => db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;
function blockOf(db: Db, workoutId: string, routineExerciseId: string) {
  return db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all()
    .find((b) => b.routineExerciseId === routineExerciseId)!;
}
const miss = (weight: number) => ({ weight, reps: [5, 5, 4] });
const hit = (weight: number) => ({ weight, reps: [8, 8, 8] });

/** Today's read of the active workout's block for `exerciseId`, as the session shows it. */
function readOf(db: Db, exerciseId: string): string | null {
  const view = getActiveWorkoutView(db)!;
  const ex = view.exercises.find((e) => e.exerciseId === exerciseId)!;
  const gear = gearFor('lb', getSettings(db));
  return programTodaysRead({
    program: ex.program!.rule,
    rule: ex.rule,
    loggingType: ex.loggingType,
    planned: ex.plannedWeight === null ? null : { weight: ex.plannedWeight, unit: ex.plannedUnit ?? 'lb' },
    override: null,
    mark: null,
    equipment: ex.equipment,
    gear,
    last: null,
  });
}

function barbellFoundations(): Db {
  const db = seededDb();
  insertProgram(db, BF);
  setActiveProgram(db, BF, NOW);
  return db;
}

describe('one progression for the same lift on different days (R625, R-w1)', () => {
  it('groups the same exercise, range and kind across days, and nothing else', () => {
    const db = barbellFoundations();
    expect(progressionGroup(db, SQUAT_A).sort()).toEqual([SQUAT_A, SQUAT_B].sort());
    expect(progressionGroup(db, `${BF_A}:barbell-bench-press`)).toEqual([`${BF_A}:barbell-bench-press`]);
  });

  it('a miss on A\'s squat carries to B: the halved increment, "One miss so far", and no starting weight to pick', () => {
    const db = barbellFoundations();
    runSession(db, BF_A, at(1), { [SQUAT_A]: miss(135) });
    expect(slotRow(db, SQUAT_B)).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb' });

    const b = startWorkoutFromDay(db, BF_B, at(2));
    expect(blockOf(db, b, SQUAT_B)).toMatchObject({ plannedWeight: 135, ruleIncrement: 2.5 });
    const view = getActiveWorkoutView(db)!;
    expect(view.exercises.find((e) => e.exerciseId === 'barbell-back-squat')!.program!.rule).toMatchObject({ halved: true, missesBefore: 1 });
    const read = readOf(db, 'barbell-back-squat');
    expect(read).toContain('One miss so far.');
    expect(read).not.toContain('Pick a starting weight');
  });

  it("Up next on day B reads the squat's progression: A's miss and its weight", () => {
    const db = barbellFoundations();
    runSession(db, BF_A, at(1), { [SQUAT_A]: miss(135) });
    const upNext = getUpNext(db)!;
    expect(upNext.dayName).toBe('B');
    expect(upNext.exercises.find((e) => e.routineExerciseId === SQUAT_B)).toMatchObject({
      nextWeight: 135,
      lastOutcome: 'held',
      lastWorkingWeight: 135,
      lastNextWeight: 135,
    });
  });

  it("a raise on A is B's planned weight", () => {
    const db = barbellFoundations();
    runSession(db, BF_A, at(1), { [SQUAT_A]: hit(135) });
    const b = startWorkoutFromDay(db, BF_B, at(2));
    expect(blockOf(db, b, SQUAT_B)).toMatchObject({ plannedWeight: 140, ruleIncrement: 5 });
  });

  it('three misses across A, B, A reset the squat on both days', () => {
    const db = barbellFoundations();
    runSession(db, BF_A, at(1), { [SQUAT_A]: miss(135) });
    runSession(db, BF_B, at(2), { [SQUAT_B]: miss(135) });
    const third = runSession(db, BF_A, at(3), { [SQUAT_A]: miss(135) });
    expect(blockOf(db, third, SQUAT_A)).toMatchObject({ outcome: 'reset', nextWeight: 120 });
    expect(slotRow(db, SQUAT_A).nextWeight).toBe(120);
    expect(slotRow(db, SQUAT_B).nextWeight).toBe(120);
  });

  it('a ladder that moves up on A moves on B too', () => {
    const db = seededDb();
    const CALI = 'program-calisthenics-foundations';
    const program = insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const a = `${CALI}:a:assisted-squat`;
    const b = `${CALI}:b:assisted-squat`;
    const ladder = program.days[0].slots.find((s) => s.id === a)!.ladder!;
    runSession(db, `${CALI}:a`, at(1), { [a]: { reps: [8, 8, 8] } });
    expect(slotRow(db, b)).toMatchObject({ ladderRung: 1, exerciseId: ladder[1].exerciseId });
  });

  it('Push/Pull/Legs bench on Push A (5–8) and Push B (8–12) stay independent', () => {
    const db = seededDb();
    const PPL = 'program-push-pull-legs';
    insertProgram(db, PPL);
    setActiveProgram(db, PPL, NOW);
    const benchA = `${PPL}:push-a:barbell-bench-press`;
    const benchB = `${PPL}:push-b:barbell-bench-press`;
    expect(progressionGroup(db, benchA)).toEqual([benchA]);
    runSession(db, `${PPL}:push-a`, at(1), { [benchA]: { weight: 185, reps: [5, 5, 4, 4] } });
    expect(slotRow(db, benchB).nextWeight).toBeNull();
    const b = startWorkoutFromDay(db, `${PPL}:push-b`, at(2));
    expect(blockOf(db, b, benchB)).toMatchObject({ plannedWeight: null, ruleIncrement: 5 });
  });

  it("Strength Peaking's top set and back-off sets stay independent", () => {
    const db = seededDb();
    const SP = 'program-strength-peaking-block';
    insertProgram(db, SP);
    setActiveProgram(db, SP, NOW);
    const top = `${SP}:squat:barbell-back-squat`;
    const backOff = `${top}@2`;
    expect(progressionGroup(db, top)).toEqual([top]);
    expect(progressionGroup(db, backOff)).toEqual([backOff]);
    runSession(db, `${SP}:squat`, at(1), { [top]: { weight: 315, reps: [1] }, [backOff]: { weight: 275, reps: [5, 5, 5] } });
    const next = startWorkoutFromDay(db, `${SP}:squat`, at(2));
    expect(blockOf(db, next, top)).toMatchObject({ plannedWeight: 315, ruleIncrement: 2.5 });
    expect(blockOf(db, next, backOff)).toMatchObject({ plannedWeight: 280, ruleIncrement: 5 });
  });

  it("deleting A's miss from History recomputes B", () => {
    const db = barbellFoundations();
    setSetting(db, 'platesLb', { ...getSettings(db).platesLb, '1.25': 1 });
    const w1 = runSession(db, BF_A, at(1), { [SQUAT_A]: miss(135) });
    const w2 = runSession(db, BF_B, at(2), { [SQUAT_B]: hit(135) });
    expect(blockOf(db, w2, SQUAT_B)).toMatchObject({ ruleIncrement: 2.5, nextWeight: 137.5 });
    expect(slotRow(db, SQUAT_A).nextWeight).toBe(137.5);

    deleteFinishedWorkout(db, w1);
    expect(blockOf(db, w2, SQUAT_B)).toMatchObject({ ruleIncrement: 5, outcome: 'raised', nextWeight: 140 });
    expect(slotRow(db, SQUAT_A).nextWeight).toBe(140);
    expect(slotRow(db, SQUAT_B).nextWeight).toBe(140);
  });

  it('your own routine with the same exercise on two days is unchanged', () => {
    const db = seededDb();
    db.insert(routines).values({ id: 'mine', name: 'Mine', isPremade: false, nextDayIndex: 0, createdAt: NOW }).run();
    for (const [i, d] of ['x', 'y'].entries()) {
      db.insert(routineDays).values({ id: `mine-${d}`, routineId: 'mine', name: d, position: i }).run();
      db.insert(routineExercises)
        .values({
          id: `mine-${d}-squat`,
          routineDayId: `mine-${d}`,
          exerciseId: 'barbell-back-squat',
          position: 0,
          setCount: 3,
          repMin: 5,
          repMax: 8,
          increment: 5,
          incrementUnit: 'lb',
        })
        .run();
    }
    setActiveProgram(db, 'mine', NOW);
    expect(progressionGroup(db, 'mine-x-squat')).toEqual(['mine-x-squat']);
    runSession(db, 'mine-x', at(1), { 'mine-x-squat': miss(135) });
    expect(slotRow(db, 'mine-x-squat').nextWeight).toBe(135);
    expect(slotRow(db, 'mine-y-squat').nextWeight).toBeNull();
    const y = startWorkoutFromDay(db, 'mine-y', at(2));
    expect(blockOf(db, y, 'mine-y-squat')).toMatchObject({ plannedWeight: null, ruleIncrement: 5, ruleKind: null });
    discardWorkout(db, y);
  });

  it("Advanced Upper/Lower DUP's heavy squat is its own progression", () => {
    const db = seededDb();
    const DUP = 'program-advanced-upper-lower-dup';
    insertProgram(db, DUP);
    setActiveProgram(db, DUP, NOW);
    const heavy = `${DUP}:lower-heavy:barbell-back-squat`;
    const light = `${DUP}:lower-light:leg-press`;
    expect(progressionGroup(db, heavy)).toEqual([heavy]);
    runSession(db, `${DUP}:lower-heavy`, at(1), { [heavy]: { weight: 225, reps: [4, 4, 3, 3] } });
    expect(slotRow(db, heavy).nextWeight).toBe(225);
    expect(slotRow(db, light).nextWeight).toBeNull();
  });

  it("Strongman Prep's log lift on Monday (3–5) and Thursday's speed reps (2) stay independent", () => {
    const db = seededDb();
    const SM = 'program-strongman-prep';
    insertProgram(db, SM);
    setActiveProgram(db, SM, NOW);
    const mon = `${SM}:mon-overhead:fedb-log-lift`;
    const thu = `${SM}:thu-events-a:fedb-log-lift`;
    expect(progressionGroup(db, mon)).toEqual([mon]);
    expect(progressionGroup(db, thu)).toEqual([thu]);
  });

  it("Hybrid Athlete's cool-down jog (@2) is its own, while the warm-up jogs on Wednesday and Friday share one", () => {
    const db = seededDb();
    const HA = 'program-hybrid-athlete';
    insertProgram(db, HA);
    setActiveProgram(db, HA, NOW);
    const wed = `${HA}:wed-intervals:easy-run`;
    const coolDown = `${wed}@2`;
    const fri = `${HA}:fri-tempo-run:easy-run`;
    expect(progressionGroup(db, coolDown)).toEqual([coolDown]);
    expect(progressionGroup(db, wed).sort()).toEqual([wed, fri].sort());
    expect(progressionGroup(db, fri).sort()).toEqual([wed, fri].sort());
  });

  it('a Modify swap on one day groups by the exercise now in the slot, never two slots of one day', () => {
    const db = barbellFoundations();
    const BENCH_A = `${BF_A}:barbell-bench-press`;
    swapRoutineExercise(db, SQUAT_B, 'barbell-front-squat');
    expect(progressionGroup(db, SQUAT_A)).toEqual([SQUAT_A]);
    expect(progressionGroup(db, SQUAT_B)).toEqual([SQUAT_B]);
    runSession(db, BF_A, at(1), { [SQUAT_A]: miss(135) });
    expect(slotRow(db, SQUAT_B).nextWeight).toBeNull();

    // Day A now holds the squat twice (its bench swapped to the squat): a slot never shares with another on its own day.
    swapRoutineExercise(db, SQUAT_B, 'barbell-back-squat');
    swapRoutineExercise(db, BENCH_A, 'barbell-back-squat');
    expect(progressionGroup(db, SQUAT_A).sort()).toEqual([SQUAT_A, SQUAT_B].sort());
    expect(progressionGroup(db, BENCH_A).sort()).toEqual([BENCH_A, SQUAT_B].sort());
    // Symmetric: B shares with each squat on A, and the two on A do not share with each other.
    expect(progressionGroup(db, SQUAT_B).sort()).toEqual([SQUAT_B, SQUAT_A, BENCH_A].sort());
  });

  it("a slot swapped back to the squat rejoins the squat's progression and takes its next weight", () => {
    const db = barbellFoundations();
    swapRoutineExercise(db, SQUAT_B, 'barbell-front-squat');
    runSession(db, BF_A, at(1), { [SQUAT_A]: hit(135) });
    swapRoutineExercise(db, SQUAT_B, 'barbell-back-squat');
    expect(slotRow(db, SQUAT_B)).toMatchObject({ nextWeight: 140, nextWeightUnit: 'lb' });
    expect(getUpNext(db)!.exercises.find((e) => e.routineExerciseId === SQUAT_B)).toMatchObject({ nextWeight: 140 });
  });

  it('Change rung on one day takes that ladder out of the shared progression', () => {
    const db = seededDb();
    const CALI = 'program-calisthenics-foundations';
    insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const a = `${CALI}:a:assisted-squat`;
    const b = `${CALI}:b:assisted-squat`;
    changeRung(db, a, 1);
    expect(progressionGroup(db, a)).toEqual([a]);
    expect(progressionGroup(db, b)).toEqual([b]);
    runSession(db, `${CALI}:a`, at(1), { [a]: { reps: [8, 8, 8] } });
    expect(slotRow(db, b).ladderRung ?? 0).toBe(0);
  });

  it('two resets of the squat across A and B are one lift dropped back twice (R614)', () => {
    const db = barbellFoundations();
    runSession(db, BF_A, at(1), { [SQUAT_A]: miss(135) });
    runSession(db, BF_B, at(2), { [SQUAT_B]: miss(135) });
    runSession(db, BF_A, at(3), { [SQUAT_A]: miss(135) });
    runSession(db, BF_B, at(4), { [SQUAT_B]: miss(120) });
    runSession(db, BF_A, at(5), { [SQUAT_A]: miss(120) });
    const last = runSession(db, BF_B, at(6), { [SQUAT_B]: miss(120) });
    expect(blockOf(db, last, SQUAT_B)).toMatchObject({ outcome: 'reset' });
    const squat = db.select({ name: exercises.name }).from(exercises).where(eq(exercises.id, 'barbell-back-squat')).get()!.name;
    expect(programPageOf(db, BF)!.droppedTwice).toEqual([squat]);
  });
});

/** Edits set `index` of the `exerciseId` block of a finished workout to `reps`, as History's editor saves it. */
function editReps(db: Db, workoutId: string, exerciseId: string, index: number, reps: number): void {
  const draft = loadWorkoutDraft(db, workoutId)!;
  const weId = draft.exercises.find((e) => e.exerciseId === exerciseId)!.workoutExerciseId;
  saveWorkoutEdit(db, patchDraftSet(draft, weId, index, { reps }));
}

describe("a lift's progression reads its sessions on any day, through swaps and rung changes (R625 amended)", () => {
  it('miss on A, miss on B, B swapped to another lift, miss on A: the third miss in a row resets', () => {
    const db = barbellFoundations();
    runSession(db, BF_A, at(1), { [SQUAT_A]: miss(135) });
    runSession(db, BF_B, at(2), { [SQUAT_B]: miss(135) });
    swapRoutineExercise(db, SQUAT_B, 'barbell-front-squat');
    const third = runSession(db, BF_A, at(3), { [SQUAT_A]: miss(135) });
    expect(blockOf(db, third, SQUAT_A)).toMatchObject({ outcome: 'reset', nextWeight: 120 });
    expect(slotRow(db, SQUAT_A).nextWeight).toBe(120);
  });

  it("an edit on A after B's swap keeps A at B's raise", () => {
    const db = barbellFoundations();
    const first = runSession(db, BF_A, at(1), { [SQUAT_A]: hit(135) });
    runSession(db, BF_B, at(2), { [SQUAT_B]: hit(140) });
    expect([slotRow(db, SQUAT_A).nextWeight, slotRow(db, SQUAT_B).nextWeight]).toEqual([145, 145]);
    swapRoutineExercise(db, SQUAT_B, 'barbell-front-squat');
    editReps(db, first, 'barbell-back-squat', 2, 8);
    expect(slotRow(db, SQUAT_A).nextWeight).toBe(145);
  });

  describe('a ladder steps down after two low sessions in a row on its rung (R618)', () => {
    const CALI = 'program-calisthenics-foundations';
    const a = `${CALI}:a:assisted-squat`;
    const b = `${CALI}:b:assisted-squat`;
    const low = { reps: [4, 4, 4] };
    const mid = { reps: [6, 6, 6] };

    it('after Change rung away and back, one low session holds the rung and a second steps down', () => {
      const db = seededDb();
      insertProgram(db, CALI);
      setActiveProgram(db, CALI, NOW);
      changeRung(db, a, 1);
      runSession(db, `${CALI}:a`, at(1), { [a]: low });
      changeRung(db, a, 0);
      runSession(db, `${CALI}:a`, at(2), { [a]: mid });
      runSession(db, `${CALI}:a`, at(3), { [a]: mid });
      changeRung(db, a, 1);
      const first = runSession(db, `${CALI}:a`, at(4), { [a]: low });
      expect(blockOf(db, first, a)).toMatchObject({ ruleRung: 1, nextRung: 1 });
      expect(slotRow(db, a).ladderRung).toBe(1);
      const second = runSession(db, `${CALI}:a`, at(5), { [a]: low });
      expect(blockOf(db, second, a)).toMatchObject({ ruleRung: 1, nextRung: 0 });
      expect(slotRow(db, a).ladderRung).toBe(0);
    });

    it("another day on another rung between two low sessions does not break the streak", () => {
      const db = seededDb();
      insertProgram(db, CALI);
      setActiveProgram(db, CALI, NOW);
      changeRung(db, a, 1);
      runSession(db, `${CALI}:a`, at(1), { [a]: low });
      runSession(db, `${CALI}:b`, at(2), { [b]: mid });
      const second = runSession(db, `${CALI}:a`, at(3), { [a]: low });
      expect(blockOf(db, second, a)).toMatchObject({ ruleRung: 1, nextRung: 0 });
    });
  });

  describe('a ladder after Change rung', () => {
    const CALI = 'program-calisthenics-foundations';
    const a = `${CALI}:a:assisted-squat`;
    const b = `${CALI}:b:assisted-squat`;
    /** A moves both days to rung 1, then B moves both to rung 2, and Change rung puts B back on rung 0. */
    function climbedThenChanged(db: Db) {
      const program = insertProgram(db, CALI);
      setActiveProgram(db, CALI, NOW);
      const ladder = program.days[0].slots.find((s) => s.id === a)!.ladder!;
      const first = runSession(db, `${CALI}:a`, at(1), { [a]: { reps: [8, 8, 8] } });
      const second = runSession(db, `${CALI}:b`, at(2), { [b]: { reps: [8, 8, 8] } });
      expect([slotRow(db, a).ladderRung, slotRow(db, b).ladderRung]).toEqual([2, 2]);
      changeRung(db, b, 0);
      return { ladder, first, second };
    }

    it("an edit on A keeps A on the rung B's session moved it to", () => {
      const db = seededDb();
      const { ladder, first } = climbedThenChanged(db);
      editReps(db, first, ladder[0].exerciseId, 0, 8);
      expect(slotRow(db, a)).toMatchObject({ ladderRung: 2, exerciseId: ladder[2].exerciseId });
      expect(slotRow(db, b)).toMatchObject({ ladderRung: 0, exerciseId: ladder[0].exerciseId });
    });

    it("an edit to B's session, which no longer reaches the top, moves A back while B keeps the rung it was given", () => {
      const db = seededDb();
      const { ladder, second } = climbedThenChanged(db);
      editReps(db, second, ladder[1].exerciseId, 0, 6);
      expect(slotRow(db, a)).toMatchObject({ ladderRung: 1, exerciseId: ladder[1].exerciseId });
      expect(slotRow(db, b)).toMatchObject({ ladderRung: 0, exerciseId: ladder[0].exerciseId });
    });
  });
});
