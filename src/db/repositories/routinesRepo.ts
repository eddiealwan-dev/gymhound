import { and, asc, desc, eq } from 'drizzle-orm';
import type { DayMark, LoggingType, WeightUnit } from '../../domain/types';
import { PREMADE_ORDER } from '../../seed/routines';
import { exercises, routineDays, routineExercises, routines, workouts } from '../schema';
import type { Db } from '../types';
import { getSettings, setSetting } from './settingsRepo';

export type RoutineSummary = {
  id: string;
  name: string;
  isPremade: boolean;
  dayCount: number;
  isActive: boolean;
};

export type UpNextExercise = {
  routineExerciseId: string;
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  setCount: number;
  repMin: number;
  repMax: number;
  nextWeight: number | null;
  nextWeightUnit: WeightUnit | null;
};

export type UpNext = {
  routineId: string;
  routineName: string;
  dayId: string;
  dayName: string;
  lastTime: { localDate: string; dayMark: DayMark } | null;
  exercises: UpNextExercise[];
};

/** The premades in `PREMADE_ORDER`, then the user's routines by creation time. */
export function listRoutines(db: Db): RoutineSummary[] {
  const activeId = getSettings(db).activeRoutineId;
  const dayCounts = new Map<string, number>();
  for (const { routineId } of db.select({ routineId: routineDays.routineId }).from(routineDays).all()) {
    dayCounts.set(routineId, (dayCounts.get(routineId) ?? 0) + 1);
  }

  const premadeRank = (id: string) => {
    const rank = PREMADE_ORDER.indexOf(id);
    return rank === -1 ? PREMADE_ORDER.length : rank;
  };
  const rows = db.select().from(routines).all();
  rows.sort((a, b) => {
    if (a.isPremade !== b.isPremade) return a.isPremade ? -1 : 1;
    if (a.isPremade) return premadeRank(a.id) - premadeRank(b.id);
    return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isPremade: r.isPremade,
    dayCount: dayCounts.get(r.id) ?? 0,
    isActive: r.id === activeId,
  }));
}

export function setActiveRoutine(db: Db, routineId: string | null): void {
  setSetting(db, 'activeRoutineId', routineId);
}

/**
 * The active routine's next day: `days[next_day_index % days.length]`, with its exercises and when it
 * was last finished. Null when there is no active routine, it no longer exists, or it has no days.
 */
export function getUpNext(db: Db): UpNext | null {
  const activeId = getSettings(db).activeRoutineId;
  if (activeId === null) return null;

  const routine = db.select().from(routines).where(eq(routines.id, activeId)).get();
  if (!routine) return null;

  const days = db
    .select()
    .from(routineDays)
    .where(eq(routineDays.routineId, routine.id))
    .orderBy(asc(routineDays.position))
    .all();
  if (days.length === 0) return null;
  const day = days[routine.nextDayIndex % days.length];

  const lastTime =
    db
      .select({ localDate: workouts.localDate, dayMark: workouts.dayMark })
      .from(workouts)
      .where(and(eq(workouts.routineDayId, day.id), eq(workouts.status, 'finished')))
      .orderBy(desc(workouts.finishedAt))
      .limit(1)
      .get() ?? null;

  const dayExercises = db
    .select({
      routineExerciseId: routineExercises.id,
      exerciseId: routineExercises.exerciseId,
      name: exercises.name,
      loggingType: exercises.loggingType,
      setCount: routineExercises.setCount,
      repMin: routineExercises.repMin,
      repMax: routineExercises.repMax,
      nextWeight: routineExercises.nextWeight,
      nextWeightUnit: routineExercises.nextWeightUnit,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineDayId, day.id))
    .orderBy(asc(routineExercises.position))
    .all();

  return {
    routineId: routine.id,
    routineName: routine.name,
    dayId: day.id,
    dayName: day.name,
    lastTime,
    exercises: dayExercises,
  };
}
