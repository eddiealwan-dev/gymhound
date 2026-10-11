import type { MeasurementSystem, WeightUnit } from '../../domain/types';
import { SEED_EXERCISES } from '../../seed/exercises';
import { ensureSettings, getSettings, setSetting } from '../repositories/settingsRepo';
import { exercises, routineDays, routineExercises, routines } from '../schema';
import type { Db } from '../types';
import { createTestDb } from './createTestDb';

/** [exercise, sets, rep min, rep max, increment: 1 the default, 2 double, 0 none] as seed version 1 wrote it. */
type V1Exercise = [string, number, number, number, 0 | 1 | 2];
type V1Routine = { id: string; name: string; days: [slug: string, name: string, exercises: V1Exercise[]][] };

/** The six premade routines exactly as seed version 1 (phases 1 and 2) bundled them, frozen for upgrade tests. */
export const V1_ROUTINES: readonly V1Routine[] = [
  {
    id: 'premade-fullbody-3',
    name: 'Full body',
    days: [
      ['a', 'A', [['barbell-back-squat', 3, 6, 10, 1], ['barbell-bench-press', 3, 6, 10, 1], ['barbell-row', 3, 8, 12, 1], ['dumbbell-lateral-raise', 2, 12, 15, 1], ['plank', 3, 30, 60, 0]]],
      ['b', 'B', [['barbell-deadlift', 3, 5, 8, 1], ['barbell-overhead-press', 3, 6, 10, 1], ['lat-pulldown', 3, 8, 12, 1], ['dumbbell-walking-lunge', 2, 8, 12, 1], ['cable-triceps-pushdown', 2, 10, 15, 1]]],
      ['c', 'C', [['leg-press', 3, 10, 15, 1], ['incline-dumbbell-press', 3, 8, 12, 1], ['seated-cable-row', 3, 10, 12, 1], ['barbell-hip-thrust', 3, 8, 12, 1], ['dumbbell-curl', 2, 10, 15, 1]]],
    ],
  },
  {
    id: 'premade-upperlower-4',
    name: 'Upper/lower',
    days: [
      ['upper-a', 'Upper A', [['barbell-bench-press', 4, 5, 8, 1], ['barbell-row', 4, 6, 10, 1], ['barbell-overhead-press', 3, 8, 12, 1], ['lat-pulldown', 3, 8, 12, 1], ['dumbbell-curl', 2, 10, 15, 1], ['cable-triceps-pushdown', 2, 10, 15, 1]]],
      ['lower-a', 'Lower A', [['barbell-back-squat', 4, 5, 8, 1], ['barbell-romanian-deadlift', 3, 8, 12, 1], ['leg-press', 3, 10, 15, 1], ['lying-leg-curl', 3, 10, 15, 1], ['standing-calf-raise', 3, 10, 15, 1]]],
      ['upper-b', 'Upper B', [['barbell-overhead-press', 4, 5, 8, 1], ['pull-up', 3, 6, 10, 1], ['incline-dumbbell-press', 3, 8, 12, 1], ['seated-cable-row', 3, 10, 12, 1], ['dumbbell-lateral-raise', 3, 12, 15, 1], ['face-pull', 2, 12, 15, 1]]],
      ['lower-b', 'Lower B', [['barbell-deadlift', 3, 4, 6, 1], ['dumbbell-bulgarian-split-squat', 3, 8, 12, 1], ['barbell-hip-thrust', 3, 8, 12, 1], ['leg-extension', 3, 10, 15, 1], ['seated-calf-raise', 3, 12, 15, 1], ['hanging-leg-raise', 3, 10, 15, 0]]],
    ],
  },
  {
    id: 'premade-ppl-6',
    name: 'Push/pull/legs',
    days: [
      ['push-a', 'Push A', [['barbell-bench-press', 4, 5, 8, 1], ['barbell-overhead-press', 3, 8, 12, 1], ['incline-dumbbell-press', 3, 8, 12, 1], ['dumbbell-lateral-raise', 3, 12, 15, 1], ['cable-triceps-pushdown', 3, 10, 15, 1]]],
      ['pull-a', 'Pull A', [['barbell-deadlift', 3, 4, 6, 1], ['pull-up', 3, 6, 10, 1], ['barbell-row', 3, 8, 12, 1], ['face-pull', 3, 12, 15, 1], ['barbell-curl', 3, 8, 12, 1]]],
      ['legs-a', 'Legs A', [['barbell-back-squat', 4, 5, 8, 1], ['barbell-romanian-deadlift', 3, 8, 12, 1], ['leg-press', 3, 10, 15, 1], ['lying-leg-curl', 3, 10, 15, 1], ['standing-calf-raise', 4, 10, 15, 1]]],
      ['push-b', 'Push B', [['barbell-overhead-press', 4, 5, 8, 1], ['barbell-incline-bench-press', 3, 6, 10, 1], ['dip', 3, 8, 12, 1], ['cable-lateral-raise', 3, 12, 15, 1], ['cable-overhead-triceps-extension', 3, 10, 15, 1]]],
      ['pull-b', 'Pull B', [['barbell-row', 4, 6, 10, 1], ['lat-pulldown', 3, 8, 12, 1], ['seated-cable-row', 3, 10, 12, 1], ['dumbbell-reverse-fly', 3, 12, 15, 1], ['dumbbell-hammer-curl', 3, 10, 15, 1]]],
      ['legs-b', 'Legs B', [['barbell-front-squat', 3, 6, 10, 1], ['barbell-hip-thrust', 3, 8, 12, 1], ['dumbbell-bulgarian-split-squat', 3, 8, 12, 1], ['leg-extension', 3, 10, 15, 1], ['seated-calf-raise', 4, 12, 15, 1]]],
    ],
  },
  {
    id: 'premade-5x5-3',
    name: '5×5',
    days: [
      ['a', 'A', [['barbell-back-squat', 5, 5, 5, 1], ['barbell-bench-press', 5, 5, 5, 1], ['barbell-row', 5, 5, 5, 1]]],
      ['b', 'B', [['barbell-back-squat', 5, 5, 5, 1], ['barbell-overhead-press', 5, 5, 5, 1], ['barbell-deadlift', 1, 5, 5, 2]]],
    ],
  },
  {
    id: 'premade-dumbbell-3',
    name: 'Dumbbell only',
    days: [
      ['a', 'A', [['dumbbell-goblet-squat', 3, 8, 12, 1], ['dumbbell-bench-press', 3, 8, 12, 1], ['dumbbell-one-arm-row', 3, 8, 12, 1], ['dumbbell-lateral-raise', 2, 12, 15, 1], ['dumbbell-curl', 2, 10, 15, 1]]],
      ['b', 'B', [['dumbbell-romanian-deadlift', 3, 8, 12, 1], ['dumbbell-seated-shoulder-press', 3, 8, 12, 1], ['dumbbell-reverse-lunge', 3, 8, 12, 1], ['dumbbell-chest-supported-row', 3, 10, 12, 1], ['dumbbell-overhead-triceps-extension', 2, 10, 15, 1]]],
      ['c', 'C', [['dumbbell-bulgarian-split-squat', 3, 8, 12, 1], ['incline-dumbbell-press', 3, 8, 12, 1], ['dumbbell-reverse-fly', 3, 12, 15, 1], ['dumbbell-hammer-curl', 2, 10, 15, 1], ['dumbbell-standing-calf-raise', 3, 12, 15, 1]]],
    ],
  },
  {
    id: 'premade-noequipment-3',
    name: 'No equipment',
    days: [
      ['a', 'A', [['bodyweight-squat', 3, 15, 25, 0], ['push-up', 3, 8, 20, 0], ['glute-bridge', 3, 12, 20, 0], ['superman', 3, 12, 20, 0], ['plank', 3, 30, 60, 0]]],
      ['b', 'B', [['bodyweight-reverse-lunge', 3, 10, 15, 0], ['pike-push-up', 3, 6, 12, 0], ['single-leg-glute-bridge', 3, 10, 15, 0], ['dead-bug', 3, 10, 15, 0], ['side-plank', 3, 20, 45, 0]]],
      ['c', 'C', [['bodyweight-split-squat', 3, 10, 15, 0], ['close-grip-push-up', 3, 6, 15, 0], ['bird-dog', 3, 10, 15, 0], ['wall-sit', 3, 30, 60, 0], ['hollow-body-hold', 3, 20, 40, 0]]],
    ],
  },
];

/** The time the v1 fixture seeds at: 2026-10-01 00:00 UTC. */
export const V1_SEEDED_AT = Date.UTC(2026, 9, 1);

/**
 * Writes the bundled data as seed version 1 left a database: the 55 exercises (no steps, no source) and the six
 * premades with their v1 days and rules, then records seed version 1. Ids are built as v1 built them.
 */
export function writeSeedV1(db: Db, now: number = V1_SEEDED_AT): void {
  const s = getSettings(db);
  const unit: WeightUnit = s.unit;
  const base = unit === 'lb' ? s.defaultIncrementLb : s.defaultIncrementKg;
  db.transaction((tx) => {
    for (const exercise of SEED_EXERCISES) tx.insert(exercises).values({ ...exercise, isCustom: false, createdAt: now }).run();
    for (const routine of V1_ROUTINES) {
      tx.insert(routines).values({ id: routine.id, name: routine.name, isPremade: true, nextDayIndex: 0, createdAt: now }).run();
      routine.days.forEach(([slug, name, rows], dayPosition) => {
        const dayId = `${routine.id}:${slug}`;
        tx.insert(routineDays).values({ id: dayId, routineId: routine.id, name, position: dayPosition }).run();
        rows.forEach(([exerciseId, setCount, repMin, repMax, inc], position) => {
          tx.insert(routineExercises)
            .values({
              id: `${dayId}:${exerciseId}`,
              routineDayId: dayId,
              exerciseId,
              position,
              setCount,
              repMin,
              repMax,
              increment: base * inc,
              incrementUnit: unit,
            })
            .run();
        });
      });
    }
    setSetting(tx, 'seedVersion', 1);
  });
}

/** A fresh in-memory database with default settings for `m`, as seed version 1 left it (see `writeSeedV1`). */
export function seededV1Db(m: MeasurementSystem = 'us'): Db {
  const { db } = createTestDb();
  ensureSettings(db, m);
  writeSeedV1(db);
  return db;
}
