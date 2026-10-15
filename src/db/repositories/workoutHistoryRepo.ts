import { and, asc, desc, eq, inArray, isNotNull, ne, notInArray } from 'drizzle-orm';
import {
  changedExercises,
  draftLeavesNothing,
  draftProblems,
  draftValuesInRange,
  type DraftSet,
  type WorkoutDraft,
} from '../../domain/historyDraft';
import { newId } from '../ids';
import { exercises, routineDays, routineExercises, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { metconLoadMove } from '../../domain/sessionBlock';
import { historySlots, programSlotOf } from './programRunRepo';
import { recomputePrFlags } from './prRepo';
import { rememberSavedWorkout } from './savedWorkoutsRepo';
import { getSettings } from './settingsRepo';
import { rerunLaterInRun, storeOutcomes } from './workoutsRepo';

/**
 * Editing and deleting finished workouts (spec 7.12, R166–R170). Each write is one transaction that re-runs the rule
 * on the edited workout, recomputes the PR flags of every exercise it touched and re-reads each routine slot's next
 * weight from the newest finished workout linked to it. The active workout is never read or written: every function
 * here refuses a workout whose status is not `finished`, and every history query filters on `finished`.
 */

/** Raised when a history edit would leave the workout with no set. Nothing is changed; the editor offers Delete. */
export class NothingLeftError extends Error {
  constructor() {
    super('Nothing would be left.');
    this.name = 'NothingLeftError';
  }
}

function requireFinished(db: Db, workoutId: string) {
  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.status !== 'finished') throw new Error(`No finished workout with id ${workoutId}.`);
  return workout;
}

/** The workout's exercise ids and linked routine slot ids, without repeats. */
function linksOf(db: Db, workoutId: string): { exerciseIds: string[]; routineExerciseIds: string[] } {
  const rows = db
    .select({ exerciseId: workoutExercises.exerciseId, routineExerciseId: workoutExercises.routineExerciseId })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .all();
  return {
    exerciseIds: [...new Set(rows.map((r) => r.exerciseId))],
    routineExerciseIds: [...new Set(rows.flatMap((r) => (r.routineExerciseId === null ? [] : [r.routineExerciseId])))],
  };
}

/** A finished workout as the history editor's draft: exercises and sets in position order. Null unless finished. */
export function loadWorkoutDraft(db: Db, workoutId: string): WorkoutDraft | null {
  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.status !== 'finished') return null;
  const blocks = db
    .select({
      id: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      name: exercises.name,
      loggingType: exercises.loggingType,
      showRpe: workoutExercises.showRpe,
      mark: workoutExercises.mark,
      routineExerciseId: workoutExercises.routineExerciseId,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  const setsOf = (workoutExerciseId: string): DraftSet[] =>
    db
      .select({
        id: sets.id,
        setType: sets.setType,
        weight: sets.weight,
        weightUnit: sets.weightUnit,
        reps: sets.reps,
        rpe: sets.rpe,
        durationS: sets.durationS,
        distance: sets.distance,
        distanceUnit: sets.distanceUnit,
        extraReps: sets.extraReps,
        done: sets.done,
      })
      .from(sets)
      .where(eq(sets.workoutExerciseId, workoutExerciseId))
      .orderBy(asc(sets.position))
      .all();
  return {
    workoutId,
    name: workout.name,
    exercises: blocks.map((b) => {
      const blockSets = setsOf(b.id);
      const score = b.loggingType === 'rounds' || b.loggingType === 'for_time';
      const metcon = score ? (programSlotOf(workout.routineId, b.routineExerciseId)?.metcon ?? null) : null;
      // A score's load can be fixed here when it has one, or when its metcon's main move takes one (ruling R-g3).
      const loadColumn = score && (blockSets.some((s) => s.weight !== null) || (metcon !== null && metconLoadMove(metcon) !== null));
      return {
        workoutExerciseId: b.id,
        exerciseId: b.exerciseId,
        name: b.name,
        loggingType: b.loggingType,
        showRpe: b.showRpe,
        mark: b.mark,
        ...(score ? { loadColumn } : {}),
        sets: blockSets,
      };
    }),
  };
}

/** A draft set's stored values: a unit only beside a value (the display unit in Settings when the draft has none). */
function setValues(s: DraftSet, unit: { weight: DraftSet['weightUnit']; distance: DraftSet['distanceUnit'] }) {
  return {
    setType: s.setType,
    weight: s.weight,
    weightUnit: s.weight === null ? null : (s.weightUnit ?? unit.weight),
    reps: s.reps,
    rpe: s.rpe,
    durationS: s.durationS,
    distance: s.distance,
    distanceUnit: s.distance === null ? null : (s.distanceUnit ?? unit.distance),
    extraReps: s.extraReps ?? null,
    done: s.done,
  };
}

/** A routine slot with the program slot it is (§18.29), or undefined for a routine of your own. */
function slotWithProgram(db: Db, id: string) {
  const row = db
    .select({ slot: routineExercises, routineId: routineDays.routineId })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(eq(routineExercises.id, id))
    .get();
  return row ? { ...row.slot, program: programSlotOf(row.routineId, id) } : undefined;
}

/**
 * The newest finished workout exercise linked to a routine slot that ran a rule (by finish time, then start, then
 * workout id, then the later block), of `exerciseId` when given. The active workout's rows are never read.
 */
function newestLinked(db: Db, ids: readonly string[], exerciseId?: string) {
  return db
    .select({
      exerciseId: workoutExercises.exerciseId,
      nextWeight: workoutExercises.nextWeight,
      nextUnit: workoutExercises.nextUnit,
      ruleRung: workoutExercises.ruleRung,
      nextRung: workoutExercises.nextRung,
      nextSetCount: workoutExercises.nextSetCount,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        inArray(workoutExercises.routineExerciseId, [...ids]),
        exerciseId === undefined ? undefined : eq(workoutExercises.exerciseId, exerciseId),
        eq(workouts.status, 'finished'),
        isNotNull(workoutExercises.outcome),
        ne(workoutExercises.outcome, 'no_rule'),
      ),
    )
    .orderBy(desc(workouts.finishedAt), desc(workouts.startedAt), desc(workouts.id), desc(workoutExercises.position))
    .limit(1)
    .get();
}

/**
 * Each of `routineExerciseIds` and, on a program, the slots on its line on the other days (`historySlots`, R625 as
 * amended), without repeats: their history holds the edited sessions, so an edit to the squat on day A re-reads day B's
 * squat too, even after B swapped its lift away and back.
 */
function withLines(db: Db, routineExerciseIds: readonly string[]): string[] {
  return [...new Set([...new Set(routineExerciseIds)].flatMap((id) => historySlots(db, id)))];
}

/**
 * The ladder slots among `routineExerciseIds` whose rung follows their history (R618): the rung their newest finished
 * session moved them to, or no session yet. One the lifter moved with Change rung since then is not among them, so a
 * history edit keeps the lifter's rung. Read before an edit or a delete changes anything.
 */
export function laddersFollowingHistory(db: Db, routineExerciseIds: readonly string[]): Set<string> {
  const following = new Set<string>();
  for (const id of withLines(db, routineExerciseIds)) {
    const slot = slotWithProgram(db, id);
    if (slot?.program?.ruleKind !== 'ladder') continue;
    const newest = newestLinked(db, historySlots(db, id));
    if (!newest || (newest.nextRung ?? newest.ruleRung ?? 0) === (slot.ladderRung ?? 0)) following.add(id);
  }
  return following;
}

/**
 * For each routine slot (R167, spec 7.3): its next weight from the most recent finished workout exercise linked to it
 * (by finish time, then start, then workout id, then the later block) that still holds the slot's exercise (R74) and
 * ran a rule (outcome not `no_rule`). With none left the slot keeps its value; a slot that no longer exists is skipped.
 * A slot with no next weight (never trained, or its progress reset when its exercise was swapped) is left alone, so a
 * reset sticks (R192): history from before the reset never refills it. The active workout's rows are never read.
 *
 * A program slot's progress follows the same newest session (§18.29): an added-sets slot takes its next set count
 * (R619), and a ladder slot in `laddersFollowing` (`laddersFollowingHistory`, read before the change) takes its next
 * rung, that rung's exercise and its next weight from the newest session on any rung (R618). On a program, each slot
 * reads its lift's sessions on any day (`historySlots`, R625 as amended), and the slots on its line on the other days
 * are refreshed too.
 */
export function refreshNextWeights(db: Db, routineExerciseIds: readonly string[], laddersFollowing: ReadonlySet<string> = new Set()): void {
  for (const id of withLines(db, routineExerciseIds)) {
    const slot = slotWithProgram(db, id);
    if (!slot) continue;
    // The lift's sessions on any day: a ladder's on any rung, any other slot's of the exercise it holds (R625 amended).
    const line = historySlots(db, id);
    const ladder = slot.program?.ruleKind === 'ladder' ? slot.program.ladder : null;
    if (ladder) {
      if (!laddersFollowing.has(id)) continue;
      const newest = newestLinked(db, line);
      if (!newest) continue;
      const rung = newest.nextRung ?? newest.ruleRung ?? 0;
      if (!ladder[rung]) continue;
      db.update(routineExercises)
        .set({ ladderRung: rung, exerciseId: ladder[rung].exerciseId, nextWeight: newest.nextWeight, nextWeightUnit: newest.nextUnit })
        .where(eq(routineExercises.id, id))
        .run();
      continue;
    }
    const addSet = slot.program?.ruleKind === 'add_set';
    if (slot.nextWeight === null && !addSet) continue;
    const newest = newestLinked(db, line, slot.exerciseId);
    if (!newest) continue;
    db.update(routineExercises)
      .set({
        ...(slot.nextWeight === null ? {} : { nextWeight: newest.nextWeight, nextWeightUnit: newest.nextUnit }),
        ...(addSet && newest.nextSetCount !== null ? { nextSetCount: newest.nextSetCount } : {}),
      })
      .where(eq(routineExercises.id, id))
      .run();
  }
}

/** Renumbers the workout's exercises, and each one's sets, 0, 1, 2… keeping their order. */
function renumber(db: Db, workoutId: string): void {
  const blocks = db
    .select({ id: workoutExercises.id, position: workoutExercises.position })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  blocks.forEach((b, position) => {
    if (b.position !== position) db.update(workoutExercises).set({ position }).where(eq(workoutExercises.id, b.id)).run();
    const blockSets = db
      .select({ id: sets.id, position: sets.position })
      .from(sets)
      .where(eq(sets.workoutExerciseId, b.id))
      .orderBy(asc(sets.position))
      .all();
    blockSets.forEach((s, setPosition) => {
      if (s.position !== setPosition) db.update(sets).set({ position: setPosition }).where(eq(sets.id, s.id)).run();
    });
  });
}

/**
 * Saves a history edit (spec 7.12, R166, R167, R169) in one transaction: the draft's sets are written (updated by id,
 * added, removed), then unticked sets are dropped and exercises left with none removed, as at finish, and positions
 * renumbered; marks are written. The rule re-runs on the workout with each exercise's own snapshot and planned weight
 * and the gear in Settings now (`storeOutcomes`), for the exercises whose sets or mark changed only (the others keep
 * their stored outcome and next weight); PR flags are recomputed for every exercise the workout had before or
 * after; each routine slot it was linked to before or after takes its next weight from its newest finished workout
 * (`refreshNextWeights`). The saved workout it was started from re-remembers its sets only when this is the latest
 * finished workout started from it (R169). Names, notes, dates and times are not edited; Up next does not move (R168). On one of the twenty
 * programs the later workouts re-run their linked exercises in time order first (§18.29: misses, resets, rungs and added
 * sets read the sessions before them), and a ladder keeps a rung the lifter chose with Change rung (R618).
 *
 * Throws, changing nothing: for a workout that is not finished (the active workout is never edited here); with
 * `NothingLeftError` when no set would be left; when a ticked set lacks a value its type needs; for a value out of range
 * (negative or non-finite, RPE outside 6 to 10); for a draft exercise or set id that is not this workout's, or a draft
 * that lists an exercise block twice or leaves out one the workout has.
 */
export function saveWorkoutEdit(db: Db, draft: WorkoutDraft): void {
  db.transaction((tx) => {
    const workout = requireFinished(tx, draft.workoutId);
    if (draftLeavesNothing(draft)) throw new NothingLeftError();
    if (draftProblems(draft).length > 0) throw new Error('A ticked set needs a value.');
    if (!draftValuesInRange(draft)) throw new Error('A set has a value out of range.');

    const before = linksOf(tx, workout.id);
    const laddersFollowing = laddersFollowingHistory(tx, before.routineExerciseIds);
    const saved = loadWorkoutDraft(tx, workout.id)!;
    const blocks = new Set(saved.exercises.map((e) => e.workoutExerciseId));
    const listed = draft.exercises.map((e) => e.workoutExerciseId);
    if (new Set(listed).size !== listed.length) throw new Error('A draft lists an exercise block twice.');
    if (listed.length !== blocks.size) throw new Error('A draft leaves out an exercise block of the workout.');
    const changed = changedExercises(saved, draft);
    const settings = getSettings(tx);
    const units = { weight: settings.unit, distance: settings.distanceUnit };
    // A set ticked in the editor has no tick time: it takes the finish time, so it sorts after the sets ticked on the day.
    const tickedAt = workout.finishedAt ?? workout.startedAt;

    for (const ex of draft.exercises) {
      if (!blocks.has(ex.workoutExerciseId)) throw new Error(`No exercise ${ex.workoutExerciseId} in workout ${workout.id}.`);
      const existing = new Map(
        tx
          .select({ id: sets.id, completedAt: sets.completedAt })
          .from(sets)
          .where(eq(sets.workoutExerciseId, ex.workoutExerciseId))
          .all()
          .map((r) => [r.id, r.completedAt]),
      );
      const kept = new Set<string>();
      ex.sets.forEach((s, position) => {
        const values = setValues(s, units);
        if (s.id === null) {
          tx.insert(sets)
            .values({ id: newId(), workoutExerciseId: ex.workoutExerciseId, position, ...values, completedAt: s.done ? tickedAt : null })
            .run();
          return;
        }
        if (!existing.has(s.id)) throw new Error(`No set ${s.id} in exercise ${ex.workoutExerciseId}.`);
        kept.add(s.id);
        const completedAt = s.done ? (existing.get(s.id) ?? tickedAt) : null;
        tx.update(sets).set({ position, ...values, completedAt }).where(eq(sets.id, s.id)).run();
      });
      const removed = [...existing.keys()].filter((id) => !kept.has(id));
      if (removed.length > 0) tx.delete(sets).where(inArray(sets.id, removed)).run();
      tx.update(workoutExercises).set({ mark: ex.mark }).where(eq(workoutExercises.id, ex.workoutExerciseId)).run();
    }

    // As at finish: unticked sets go, then exercises left with no set.
    const blockIds = tx.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.workoutId, workout.id));
    tx.delete(sets)
      .where(and(inArray(sets.workoutExerciseId, blockIds), eq(sets.done, false)))
      .run();
    tx.delete(workoutExercises)
      .where(
        and(
          eq(workoutExercises.workoutId, workout.id),
          notInArray(workoutExercises.id, tx.select({ id: sets.workoutExerciseId }).from(sets).where(inArray(sets.workoutExerciseId, blockIds))),
        ),
      )
      .run();
    renumber(tx, workout.id);

    storeOutcomes(tx, workout.id, changed);
    const after = linksOf(tx, workout.id);
    const slots = [...before.routineExerciseIds, ...after.routineExerciseIds];
    rerunLaterInRun(tx, workout, slots);
    recomputePrFlags(tx, [...new Set([...before.exerciseIds, ...after.exerciseIds])]);
    refreshNextWeights(tx, slots, laddersFollowing);

    if (workout.savedWorkoutId !== null && isLatestFromSaved(tx, workout.savedWorkoutId, workout.id)) {
      rememberSavedWorkout(tx, workout.id);
    }
  });
}

/** Whether `workoutId` is the latest finished workout started from the saved workout (by finish time). */
function isLatestFromSaved(db: Db, savedWorkoutId: string, workoutId: string): boolean {
  const latest = db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.savedWorkoutId, savedWorkoutId), eq(workouts.status, 'finished')))
    .orderBy(desc(workouts.finishedAt), desc(workouts.startedAt), desc(workouts.id))
    .limit(1)
    .get();
  return latest?.id === workoutId;
}

/**
 * Deletes a finished workout with its exercises and sets (spec 7.12), in one transaction, then recomputes the PR flags
 * of its exercises and the next weights of the routine slots it was linked to, from the workouts left (on a program,
 * after re-running the later workouts' linked exercises in time order, as an edit does). Saved workouts
 * and the routines' Up next pointers are not changed (R168, R169). Throws, changing nothing, for a workout that is not
 * finished.
 */
export function deleteFinishedWorkout(db: Db, workoutId: string): void {
  db.transaction((tx) => {
    const workout = requireFinished(tx, workoutId);
    // Collected first: the rows are gone after the delete.
    const { exerciseIds, routineExerciseIds } = linksOf(tx, workoutId);
    const laddersFollowing = laddersFollowingHistory(tx, routineExerciseIds);
    const blockIds = tx.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.workoutId, workoutId));
    tx.delete(sets).where(inArray(sets.workoutExerciseId, blockIds)).run();
    tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).run();
    tx.delete(workouts).where(eq(workouts.id, workoutId)).run();
    rerunLaterInRun(tx, workout, routineExerciseIds);
    recomputePrFlags(tx, exerciseIds);
    refreshNextWeights(tx, routineExerciseIds, laddersFollowing);
  });
}
