import { eq, inArray } from 'drizzle-orm';
import { customPattern } from '../../domain/customExercise';
import { guessOwnExercise, matchExercise, type MatchCandidate } from '../../domain/exerciseMatch';
import type { ImportedBody, ImportedFood, ImportedSet, ImportedWorkout, ImportPlan } from '../../domain/importCsv';
import type { MeasurementUnit, WeightUnit } from '../../domain/types';
import { newId } from '../ids';
import { bodyweight, exercises, foodLog, measurements, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { recomputePrFlags } from './prRepo';

/** Rows per INSERT, well under SQLite's bound-variable limit for the widest table (sets, 14 columns). */
const CHUNK = 50;

/** A short, stable fingerprint of some text (two FNV-1a hashes), so the same row imported again gets the same id. */
export function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(36).padStart(7, '0') + b.toString(36).padStart(7, '0');
}

const setText = (s: ImportedSet) => [s.setType, s.weight, s.weightUnit, s.reps, s.durationS, s.distance, s.distanceUnit].join(',');

/** A workout's id: the file's own (GymHound's export), else a fingerprint of when it was and what was in it. */
function workoutId(w: ImportedWorkout): string {
  return w.sourceId ?? `imp-${fingerprint(`${w.localDate}|${w.startedAt}|${w.name}|${w.exercises.map((e) => `${e.name}:${e.sets.map(setText).join(';')}`).join('|')}`)}`;
}

const bodyKey = (e: { kind: string; localDate: string; value: number; unit: string }) => `${e.kind}|${e.localDate}|${Math.round(e.value * 100)}|${e.unit}`;
const foodKey = (e: { localDate: string; loggedAt: number; name: string; kcal: number }) => `${e.localDate}|${e.loggedAt}|${e.name.trim().toLowerCase()}|${Math.round(e.kcal)}`;

/** The exercises an import can match: the library and your own, not archived. */
function candidates(db: Db): MatchCandidate[] {
  return db
    .select({ id: exercises.id, name: exercises.name, aliases: exercises.aliases, equipment: exercises.equipment, isCustom: exercises.isCustom })
    .from(exercises)
    .where(eq(exercises.archived, false))
    .all();
}

/** An imported exercise name and what it becomes: an exercise you have, or one added as your own. */
export type ExerciseMapping = { name: string; to: { id: string; name: string } | null };

/** What an import would add (R565), worked out before anything is written, for the screen to show first. */
export type ImportPreview =
  | {
      kind: 'workouts';
      workouts: number;
      sets: number;
      alreadyIn: number;
      firstDate: string | null;
      lastDate: string | null;
      /** Each name in the file, with the exercise it matched; `to` is null for one added as your own. */
      exercises: ExerciseMapping[];
    }
  | { kind: 'body' | 'food'; entries: number; alreadyIn: number; firstDate: string | null; lastDate: string | null };

/** Each different exercise name in the workouts, as first written, with what it matches. */
function mapExercises(db: Db, list: readonly ImportedWorkout[]): ExerciseMapping[] {
  const all = candidates(db);
  const seen = new Map<string, ExerciseMapping>();
  for (const w of list) {
    for (const e of w.exercises) {
      const k = e.name.trim().toLowerCase();
      if (seen.has(k)) continue;
      const hit = matchExercise(e.name, all);
      seen.set(k, { name: e.name.trim(), to: hit === null ? null : { id: hit.id, name: hit.name } });
    }
  }
  return [...seen.values()];
}

function existingIds(db: Db, ids: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    for (const r of db.select({ id: workouts.id }).from(workouts).where(inArray(workouts.id, ids.slice(i, i + 500))).all()) found.add(r.id);
  }
  return found;
}

function existingBodyKeys(db: Db): Set<string> {
  const keys = new Set<string>();
  for (const r of db.select({ localDate: bodyweight.localDate, value: bodyweight.weight, unit: bodyweight.unit }).from(bodyweight).all()) keys.add(bodyKey({ kind: 'bodyweight', ...r }));
  for (const r of db.select({ kind: measurements.kind, localDate: measurements.localDate, value: measurements.value, unit: measurements.unit }).from(measurements).all()) keys.add(bodyKey(r));
  return keys;
}

function existingFoodKeys(db: Db): Set<string> {
  return new Set(db.select({ localDate: foodLog.localDate, loggedAt: foodLog.loggedAt, name: foodLog.name, kcal: foodLog.kcal }).from(foodLog).all().map(foodKey));
}

/** The entries not already in GymHound, nor repeated earlier in the same file. */
function fresh<T>(entries: readonly T[], keyOf: (e: T) => string, existing: Set<string>): T[] {
  const taken = new Set(existing);
  return entries.filter((e) => {
    const k = keyOf(e);
    if (taken.has(k)) return false;
    taken.add(k);
    return true;
  });
}

const span = (dates: readonly string[]) => (dates.length === 0 ? { firstDate: null, lastDate: null } : { firstDate: dates.reduce((a, b) => (a < b ? a : b)), lastDate: dates.reduce((a, b) => (a > b ? a : b)) });

export function previewImport(db: Db, plan: Exclude<ImportPlan, { kind: 'unknown' }>): ImportPreview {
  if (plan.kind === 'workouts') {
    const ids = plan.workouts.map(workoutId);
    const there = existingIds(db, ids);
    const toAdd = plan.workouts.filter((_, i) => !there.has(ids[i]));
    return {
      kind: 'workouts',
      workouts: toAdd.length,
      sets: toAdd.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0),
      alreadyIn: plan.workouts.length - toAdd.length,
      ...span(toAdd.map((w) => w.localDate)),
      exercises: mapExercises(db, toAdd),
    };
  }
  if (plan.kind === 'body') {
    const toAdd = fresh(plan.entries, bodyKey, existingBodyKeys(db));
    return { kind: 'body', entries: toAdd.length, alreadyIn: plan.entries.length - toAdd.length, ...span(toAdd.map((e) => e.localDate)) };
  }
  const toAdd = fresh(plan.entries, foodKey, existingFoodKeys(db));
  return { kind: 'food', entries: toAdd.length, alreadyIn: plan.entries.length - toAdd.length, ...span(toAdd.map((e) => e.localDate)) };
}

/** What an import added. */
export type ImportResult = {
  /** Workouts, or body or food entries. */
  added: number;
  /** Sets, for workouts. */
  sets: number;
  alreadyIn: number;
  /** Exercises added as your own, by name. */
  newExercises: string[];
  /** Of those, the ones whose names didn't say which muscle they work: Stats can't count them until you say. */
  noMuscle: string[];
};

function insertChunks<T extends Record<string, unknown>>(db: Db, table: Parameters<Db['insert']>[0], rows: readonly T[]): void {
  for (let i = 0; i < rows.length; i += CHUNK) db.insert(table).values(rows.slice(i, i + CHUNK) as never).run();
}

/**
 * Writes an import (R565) in one transaction: nothing is half added. Workouts go in as finished workouts on their own
 * days, every set done; an exercise name no exercise matches is added as your own (equipment, main muscle and how it is
 * logged guessed from its name and sets), and the personal records of every exercise touched are worked out again
 * over the whole history. Body entries keep their units; food entries keep their own totals, like a quick add. Whatever
 * is already in GymHound (the same workout id or fingerprint, the same entry on the same day) is left out, so the same
 * file imported twice adds nothing the second time. Imported workouts are marked as written to Apple Health, so none
 * is copied there as new.
 */
export function applyImport(db: Db, plan: Exclude<ImportPlan, { kind: 'unknown' }>, now: number): ImportResult {
  return db.transaction((tx) => {
    if (plan.kind === 'body') {
      const toAdd = fresh(plan.entries, bodyKey, existingBodyKeys(tx));
      const fp = (e: ImportedBody) => `imp-${fingerprint(`${bodyKey(e)}|${e.measuredAt}`)}`;
      insertChunks(
        tx,
        bodyweight,
        toAdd.filter((e) => e.kind === 'bodyweight').map((e) => ({ id: fp(e), localDate: e.localDate, measuredAt: e.measuredAt, weight: e.value, unit: e.unit as WeightUnit })),
      );
      insertChunks(
        tx,
        measurements,
        toAdd
          .filter((e) => e.kind !== 'bodyweight')
          .map((e) => ({ id: fp(e), kind: e.kind as Exclude<ImportedBody['kind'], 'bodyweight'>, localDate: e.localDate, measuredAt: e.measuredAt, value: e.value, unit: e.unit as MeasurementUnit })),
      );
      return { added: toAdd.length, sets: 0, alreadyIn: plan.entries.length - toAdd.length, newExercises: [], noMuscle: [] };
    }

    if (plan.kind === 'food') {
      const toAdd = fresh(plan.entries, foodKey, existingFoodKeys(tx));
      insertChunks(
        tx,
        foodLog,
        toAdd.map((e: ImportedFood) => ({
          id: `imp-${fingerprint(foodKey(e))}`,
          localDate: e.localDate,
          loggedAt: e.loggedAt,
          foodId: null,
          name: e.name,
          servings: e.servings,
          kcal: e.kcal,
          proteinG: e.proteinG,
          carbsG: e.carbsG,
          fatG: e.fatG,
          servingLabel: null,
        })),
      );
      return { added: toAdd.length, sets: 0, alreadyIn: plan.entries.length - toAdd.length, newExercises: [], noMuscle: [] };
    }

    const ids = plan.workouts.map(workoutId);
    const there = existingIds(tx, ids);
    const toAdd = plan.workouts.map((w, i) => ({ w, id: ids[i] })).filter(({ id }, i) => !there.has(id) && ids.indexOf(id) === i);

    // Each name once: an exercise you have, or a new one of your own.
    const resolved = new Map<string, string>();
    const newExercises: string[] = [];
    const noMuscle: string[] = [];
    for (const m of mapExercises(
      tx,
      toAdd.map(({ w }) => w),
    )) {
      if (m.to !== null) {
        resolved.set(m.name.toLowerCase(), m.to.id);
        continue;
      }
      const allSets = toAdd.flatMap(({ w }) => w.exercises.filter((e) => e.name.trim().toLowerCase() === m.name.toLowerCase()).flatMap((e) => e.sets));
      const guess = guessOwnExercise(m.name, allSets);
      const id = newId();
      const name = [...m.name].slice(0, 60).join('').trim();
      tx.insert(exercises)
        .values({
          id,
          name,
          aliases: [],
          primaryMuscles: guess.primaryMuscles,
          secondaryMuscles: [],
          equipment: guess.equipment,
          pattern: customPattern(guess),
          loggingType: guess.loggingType,
          isCustom: true,
          archived: false,
          createdAt: now,
          instructions: [],
          sourceId: null,
        })
        .run();
      resolved.set(m.name.toLowerCase(), id);
      newExercises.push(name);
      if (guess.primaryMuscles.length === 0) noMuscle.push(name);
    }

    const workoutRows = toAdd.map(({ w, id }) => ({
      id,
      name: w.name.slice(0, 120),
      routineId: null,
      routineDayId: null,
      status: 'finished' as const,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      localDate: w.localDate,
      foodOfferShown: true,
      sleepOfferShown: true,
      healthStatus: 'done' as const,
    }));
    const exerciseRows: (typeof workoutExercises.$inferInsert)[] = [];
    const setRows: (typeof sets.$inferInsert)[] = [];
    for (const { w, id } of toAdd) {
      w.exercises.forEach((e, position) => {
        const weId = `${id}-e${position}`;
        exerciseRows.push({
          id: weId,
          workoutId: id,
          exerciseId: resolved.get(e.name.trim().toLowerCase())!,
          position,
          showRpe: e.sets.some((s) => s.rpe !== null),
          outcome: 'no_rule',
          note: e.note,
        });
        e.sets.forEach((s, k) => setRows.push({ id: `${weId}-s${k}`, workoutExerciseId: weId, position: k, ...s, done: true, completedAt: null }));
      });
    }
    insertChunks(tx, workouts, workoutRows);
    insertChunks(tx, workoutExercises, exerciseRows);
    insertChunks(tx, sets, setRows);
    recomputePrFlags(tx, [...new Set(exerciseRows.map((r) => r.exerciseId))]);
    return { added: toAdd.length, sets: setRows.length, alreadyIn: plan.workouts.length - toAdd.length, newExercises, noMuscle };
  });
}
