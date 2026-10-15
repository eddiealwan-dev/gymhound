/** @jest-environment node */
// History edits and deletes on a program (spec §7.12, R612–R619): misses, resets, rungs and added sets are derived from
// finished history, so an edit or a delete re-derives them in time order.
import { asc, eq } from 'drizzle-orm';
import { patchDraftSet } from '../../domain/historyDraft';
import { routineExercises, workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import { insertProgram, runSession } from '../testing/programFixture';
import type { Db } from '../types';
import { changeRung, setActiveProgram } from './programRunRepo';
import { deleteFinishedWorkout, loadWorkoutDraft, saveWorkoutEdit } from './workoutHistoryRepo';
import { startWorkoutFromDay } from './workoutsRepo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const at = (n: number) => NOW + n * DAY;

const BF = 'program-barbell-foundations';
const BF_A = `${BF}:a`;
const SQUAT_A = `${BF_A}:barbell-back-squat`;

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

/** Three squat misses in a row on Barbell Foundations, the third a reset to 120 lb. */
function threeMisses(db: Db): string[] {
  insertProgram(db, BF);
  setActiveProgram(db, BF, NOW);
  const ids = [1, 2, 3].map((n) => runSession(db, BF_A, at(n), { [SQUAT_A]: { weight: 135, reps: [5, 5, 4] } }));
  expect(blockOf(db, ids[2], SQUAT_A)).toMatchObject({ outcome: 'reset', nextWeight: 120 });
  expect(slotRow(db, SQUAT_A).nextWeight).toBe(120);
  return ids;
}

describe('a history edit or delete on a program (§7.12)', () => {
  it('deleting the third miss from History removes the reset and restores the weight', () => {
    const db = seededDb();
    const [, , third] = threeMisses(db);
    deleteFinishedWorkout(db, third);
    expect(slotRow(db, SQUAT_A)).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb' });
    // The count is derived again: the next miss is the third and resets.
    const again = runSession(db, BF_A, at(4), { [SQUAT_A]: { weight: 135, reps: [5, 5, 4] } });
    expect(blockOf(db, again, SQUAT_A)).toMatchObject({ outcome: 'reset', nextWeight: 120 });
  });

  it('editing an earlier miss into a hit re-derives the later sessions in time order', () => {
    const db = seededDb();
    const [, second, third] = threeMisses(db);
    const draft = loadWorkoutDraft(db, second)!;
    const weId = draft.exercises.find((e) => e.exerciseId === 'barbell-back-squat')!.workoutExerciseId;
    saveWorkoutEdit(db, patchDraftSet(draft, weId, 2, { reps: 8 }));
    expect(blockOf(db, second, SQUAT_A)).toMatchObject({ missed: false, outcome: 'held' });
    // The third is now one miss in a row, not three: it holds, and so does the slot.
    expect(blockOf(db, third, SQUAT_A)).toMatchObject({ missed: true, outcome: 'held', nextWeight: 135 });
    expect(slotRow(db, SQUAT_A).nextWeight).toBe(135);
  });

  it('deleting the session that moved a rung moves the slot back', () => {
    const db = seededDb();
    const CALI = 'program-calisthenics-foundations';
    const program = insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const slot = `${CALI}:a:assisted-squat`;
    const ladder = program.days[0].slots.find((s) => s.id === slot)!.ladder!;
    const w1 = runSession(db, `${CALI}:a`, at(1), { [slot]: { reps: [6, 6, 6] } });
    const w2 = runSession(db, `${CALI}:a`, at(2), { [slot]: { reps: [8, 8, 8] } });
    expect(slotRow(db, slot)).toMatchObject({ ladderRung: 1, exerciseId: ladder[1].exerciseId });
    deleteFinishedWorkout(db, w2);
    expect(slotRow(db, slot)).toMatchObject({ ladderRung: 0, exerciseId: ladder[0].exerciseId });
    expect(blockOf(db, w1, slot)).toMatchObject({ nextRung: 0 });
  });

  it("an edit keeps the rung the lifter chose with Change rung after the last session", () => {
    const db = seededDb();
    const CALI = 'program-calisthenics-foundations';
    const program = insertProgram(db, CALI);
    setActiveProgram(db, CALI, NOW);
    const slot = `${CALI}:a:assisted-squat`;
    const ladder = program.days[0].slots.find((s) => s.id === slot)!.ladder!;
    const w1 = runSession(db, `${CALI}:a`, at(1), { [slot]: { reps: [6, 6, 6] } });
    changeRung(db, slot, 3);
    const draft = loadWorkoutDraft(db, w1)!;
    saveWorkoutEdit(db, patchDraftSet(draft, draft.exercises.find((e) => e.exerciseId === ladder[0].exerciseId)!.workoutExerciseId, 0, { reps: 8 }));
    expect(slotRow(db, slot)).toMatchObject({ ladderRung: 3, exerciseId: ladder[3].exerciseId });
    const next = startWorkoutFromDay(db, `${CALI}:a`, at(2));
    expect(blockOf(db, next, slot)).toMatchObject({ ruleRung: 3, exerciseId: ladder[3].exerciseId });
  });

  it('deleting a completed Armor Building Complex session takes its added set back', () => {
    const db = seededDb('metric');
    const KB = 'program-kettlebell-strength-conditioning';
    insertProgram(db, KB, 'kg');
    setActiveProgram(db, KB, NOW);
    const dayId = `${KB}:c-complex`;
    const complex = `${dayId}:armor-building-complex`;
    runSession(db, dayId, at(1), { [complex]: { weight: 16, unit: 'kg', reps: [2, 2, 2, 2, 2] } });
    const w2 = runSession(db, dayId, at(2), { [complex]: { weight: 16, unit: 'kg', reps: [2, 2, 2, 2, 2, 2] } });
    expect(slotRow(db, complex).nextSetCount).toBe(7);
    deleteFinishedWorkout(db, w2);
    expect(slotRow(db, complex).nextSetCount).toBe(6);
  });
});
