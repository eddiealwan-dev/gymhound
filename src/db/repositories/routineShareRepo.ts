import { eq, inArray } from 'drizzle-orm';
import type { RoutineDraft } from '../../domain/routineDraft';
import { isShareableLibraryId, type DecodeResult, type SharedCustomExercise, type SharedRoutine } from '../../domain/routineShare';
import { exercises, routines } from '../schema';
import type { Db } from '../types';
import { createCustomExercise } from './customExercisesRepo';
import { getRestSeconds, setRestSeconds } from './exercisePrefsRepo';
import { getRoutineDetail, saveRoutine } from './routinesRepo';

/**
 * Routine sharing's database side (§18.18). `sharedRoutineFor` reads a routine, premade or your own, as what a code
 * carries; `previewShared` says what adding one would do; `importSharedRoutine` adds it as a new routine of your own.
 * Nothing about the person travels: no history, next weights, notes or photos (R460).
 */

/**
 * A routine as a code carries it, or null when it does not exist. A library exercise travels by id, an exercise of
 * your own (or one the library list doesn't name) as a custom with its name, type, equipment and muscles. Each
 * exercise's own rest on this phone travels with it.
 */
export function sharedRoutineFor(db: Db, routineId: string): SharedRoutine | null {
  const detail = getRoutineDetail(db, routineId);
  if (detail === null) return null;
  const ids = [...new Set(detail.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  const rows =
    ids.length === 0
      ? []
      : db
          .select({
            id: exercises.id,
            name: exercises.name,
            isCustom: exercises.isCustom,
            loggingType: exercises.loggingType,
            equipment: exercises.equipment,
            primaryMuscles: exercises.primaryMuscles,
            secondaryMuscles: exercises.secondaryMuscles,
          })
          .from(exercises)
          .where(inArray(exercises.id, ids))
          .all();
  const byId = new Map(rows.map((r) => [r.id, r]));

  const customs: SharedCustomExercise[] = [];
  const customIndex = new Map<string, number>();
  const refFor = (exerciseId: string) => {
    const row = byId.get(exerciseId);
    if (row !== undefined && !row.isCustom && isShareableLibraryId(exerciseId)) return { library: exerciseId };
    let at = customIndex.get(exerciseId);
    if (at === undefined) {
      at = customs.length;
      customIndex.set(exerciseId, at);
      customs.push({
        name: row?.name ?? 'Exercise',
        loggingType: row?.loggingType ?? 'weighted',
        equipment: row?.equipment ?? 'other',
        primaryMuscles: row?.primaryMuscles.length ? row.primaryMuscles : ['chest'],
        secondaryMuscles: row?.secondaryMuscles ?? [],
      });
    }
    return { custom: at };
  };

  return {
    name: detail.name,
    customs,
    days: detail.days.map((day) => ({
      name: day.name,
      slots: day.exercises.map((e, i, all) => ({
        exercise: refFor(e.exerciseId),
        setCount: e.setCount,
        repMin: e.repMin,
        repMax: e.repMax,
        increment: e.increment,
        incrementUnit: e.incrementUnit,
        supersetWithNext: e.supersetGroup !== null && all[i + 1]?.supersetGroup === e.supersetGroup,
        restSeconds: getRestSeconds(db, e.exerciseId),
      })),
    })),
  };
}

/**
 * The routine a code that reads holds: the routine itself, or for a premade named by its code (R472) this phone's own
 * copy of that program, which is the same on every phone. Null when the premade isn't here.
 */
export function sharedFromDecoded(db: Db, decoded: Extract<DecodeResult, { ok: true }>): SharedRoutine | null {
  return decoded.routine ?? sharedRoutineFor(db, decoded.premadeId);
}

/** An exercise of your own on this phone that a shared one becomes: same name (any case) and logging type, not archived. */
function matchCustom(db: Db, custom: SharedCustomExercise): string | null {
  const name = custom.name.trim().toLowerCase();
  const found = db
    .select({ id: exercises.id, name: exercises.name, loggingType: exercises.loggingType })
    .from(exercises)
    .where(eq(exercises.archived, false))
    .all()
    .find((e) => e.name.trim().toLowerCase() === name && e.loggingType === custom.loggingType);
  return found?.id ?? null;
}

export type SharedPreview = {
  name: string;
  dayCount: number;
  exerciseCount: number;
  /** Exercises of the sender's own that will be made here, by name. */
  newExercises: string[];
  /** Exercises this phone's library doesn't have (a code from a newer GymHound): skipped. */
  missingCount: number;
};

/** What adding the shared routine would do, before anything is written (R466). */
export function previewShared(db: Db, shared: SharedRoutine): SharedPreview {
  const slots = shared.days.flatMap((d) => d.slots);
  const used = new Set(slots.flatMap((s) => ('custom' in s.exercise ? [s.exercise.custom] : [])));
  return {
    name: shared.name,
    dayCount: shared.days.length,
    exerciseCount: slots.filter((s) => !('missing' in s.exercise)).length,
    newExercises: shared.customs.filter((c, i) => used.has(i) && matchCustom(db, c) === null).map((c) => c.name),
    missingCount: slots.filter((s) => 'missing' in s.exercise).length,
  };
}

/** The name as given, or with " (2)", " (3)" … when a routine already has it (R468). */
function freeName(db: Db, name: string): string {
  const taken = new Set(db.select({ name: routines.name }).from(routines).all().map((r) => r.name.trim().toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export type ImportResult = { routineId: string; name: string; skipped: number };

/**
 * Adds the shared routine as a new routine of your own (R466–R468): new ids, never over another; a name already in use
 * gets " (2)"; each exercise of the sender's own matches one here by name and type or is made; an exercise this
 * library lacks is skipped, and a day left with none is dropped. An exercise's shared rest is set only where this
 * phone has none of its own, so importing never changes rests you chose. The free limit is the caller's to check
 * first. Throws when nothing would be left to add.
 */
export function importSharedRoutine(db: Db, shared: SharedRoutine, now: number): ImportResult {
  return db.transaction((tx) => {
    const customIds = new Map<number, string>();
    const idForCustom = (i: number): string => {
      let id = customIds.get(i);
      if (id === undefined) {
        const custom = shared.customs[i];
        id = matchCustom(tx, custom) ?? createCustomExercise(tx, custom, now);
        customIds.set(i, id);
      }
      return id;
    };
    const libraryIds = new Set(tx.select({ id: exercises.id }).from(exercises).all().map((e) => e.id));
    const names = new Map(tx.select({ id: exercises.id, name: exercises.name, loggingType: exercises.loggingType }).from(exercises).all().map((e) => [e.id, e]));

    let key = 1;
    let skipped = 0;
    const rests: { exerciseId: string; seconds: number }[] = [];
    const days: RoutineDraft['days'] = [];
    for (const day of shared.days) {
      const kept = day.slots.flatMap((slot, i) => {
        let exerciseId: string | null = null;
        if ('library' in slot.exercise) exerciseId = libraryIds.has(slot.exercise.library) ? slot.exercise.library : null;
        else if ('custom' in slot.exercise) exerciseId = idForCustom(slot.exercise.custom);
        if (exerciseId === null) {
          skipped++;
          return [];
        }
        const meta = names.get(exerciseId) ?? tx.select({ id: exercises.id, name: exercises.name, loggingType: exercises.loggingType }).from(exercises).where(eq(exercises.id, exerciseId)).get()!;
        if (slot.restSeconds !== null) rests.push({ exerciseId, seconds: slot.restSeconds });
        return [
          {
            key: `e${key++}`,
            id: null,
            exerciseId,
            name: meta.name,
            loggingType: meta.loggingType,
            setCount: slot.setCount,
            repMin: slot.repMin,
            repMax: slot.repMax,
            increment: slot.increment,
            incrementUnit: slot.incrementUnit,
            supersetWithNext: slot.supersetWithNext && i < day.slots.length - 1,
          },
        ];
      });
      if (kept.length === 0) continue;
      // A skipped exercise must not leave a link pointing past the day's end.
      kept[kept.length - 1].supersetWithNext = false;
      days.push({ key: `d${key++}`, id: null, name: day.name, exercises: kept });
    }
    if (days.length === 0) throw new Error('Nothing in the shared routine exists on this phone.');

    const name = freeName(tx, shared.name.trim());
    const routineId = saveRoutine(tx, { id: null, name, days, nextKey: key }, now);
    for (const { exerciseId, seconds } of rests) {
      if (getRestSeconds(tx, exerciseId) === null) setRestSeconds(tx, exerciseId, seconds, now);
    }
    return { routineId, name, skipped };
  });
}
