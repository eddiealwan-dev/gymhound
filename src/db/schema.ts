import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
  DayMark,
  DistanceUnit,
  Equipment,
  LoggingType,
  Muscle,
  Pattern,
  SetType,
  WeightUnit,
} from '../domain/types';

// Spec §6. IDs are text. Timestamps are epoch milliseconds. Booleans are integers 0/1.

export type WorkoutStatus = 'active' | 'finished';
export type WorkoutOutcome = 'raised' | 'held' | 'held_marked' | 'no_rule' | 'no_sets';
export type FoodSource = 'bundled' | 'custom';

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull(),
  primaryMuscles: text('primary_muscles', { mode: 'json' }).$type<Muscle[]>().notNull(),
  secondaryMuscles: text('secondary_muscles', { mode: 'json' }).$type<Muscle[]>().notNull(),
  equipment: text('equipment').$type<Equipment>().notNull(),
  pattern: text('pattern').$type<Pattern>().notNull(),
  loggingType: text('logging_type').$type<LoggingType>().notNull(),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const exerciseNotes = sqliteTable('exercise_notes', {
  exerciseId: text('exercise_id')
    .primaryKey()
    .references(() => exercises.id),
  text: text('text').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isPremade: integer('is_premade', { mode: 'boolean' }).notNull(),
  nextDayIndex: integer('next_day_index').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const routineDays = sqliteTable('routine_days', {
  id: text('id').primaryKey(),
  routineId: text('routine_id')
    .notNull()
    .references(() => routines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
});

export const routineExercises = sqliteTable('routine_exercises', {
  id: text('id').primaryKey(),
  routineDayId: text('routine_day_id')
    .notNull()
    .references(() => routineDays.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  position: integer('position').notNull(),
  supersetGroup: integer('superset_group'),
  setCount: integer('set_count').notNull(),
  // Seconds for `timed` exercises. Unused for `distance_time`.
  repMin: integer('rep_min').notNull(),
  repMax: integer('rep_max').notNull(),
  // 0 means progression by reps only.
  increment: real('increment').notNull(),
  incrementUnit: text('increment_unit').$type<WeightUnit>().notNull(),
  // Cached result of the progression rule (7.3). Null until the first run.
  nextWeight: real('next_weight'),
  nextWeightUnit: text('next_weight_unit').$type<WeightUnit>(),
});

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // Deliberately not foreign keys: history must survive a routine being deleted.
    routineId: text('routine_id'),
    routineDayId: text('routine_day_id'),
    status: text('status').$type<WorkoutStatus>().notNull(),
    dayMark: text('day_mark').$type<DayMark>().notNull().default('normal'),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    localDate: text('local_date').notNull(),
    // Absolute end time of the running rest timer.
    restEndsAt: integer('rest_ends_at'),
    foodOfferShown: integer('food_offer_shown', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('workouts_status_idx').on(t.status),
    index('workouts_local_date_idx').on(t.localDate),
    uniqueIndex('one_active_workout').on(t.status).where(sql`status = 'active'`),
  ],
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    // Deliberately not a foreign key. Null for exercises in an empty workout or added ad hoc.
    routineExerciseId: text('routine_exercise_id'),
    position: integer('position').notNull(),
    supersetGroup: integer('superset_group'),
    showRpe: integer('show_rpe', { mode: 'boolean' }).notNull(),
    // Snapshot of the rule when the workout started. Null if no rule.
    ruleSetCount: integer('rule_set_count'),
    ruleRepMin: integer('rule_rep_min'),
    ruleRepMax: integer('rule_rep_max'),
    ruleIncrement: real('rule_increment'),
    ruleIncrementUnit: text('rule_increment_unit').$type<WeightUnit>(),
    // The rule's target when the workout started.
    plannedWeight: real('planned_weight'),
    plannedUnit: text('planned_unit').$type<WeightUnit>(),
    // Today-only override. Never written back to the rule.
    overrideWeight: real('override_weight'),
    overrideUnit: text('override_unit').$type<WeightUnit>(),
    // Computed at finish (7.3).
    workingWeight: real('working_weight'),
    workingUnit: text('working_unit').$type<WeightUnit>(),
    outcome: text('outcome').$type<WorkoutOutcome>(),
    nextWeight: real('next_weight'),
    nextUnit: text('next_unit').$type<WeightUnit>(),
  },
  (t) => [
    index('workout_exercises_workout_id_idx').on(t.workoutId),
    index('workout_exercises_exercise_id_idx').on(t.exerciseId),
    index('workout_exercises_routine_exercise_id_idx').on(t.routineExerciseId),
  ],
);

export const sets = sqliteTable(
  'sets',
  {
    id: text('id').primaryKey(),
    workoutExerciseId: text('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    setType: text('set_type').$type<SetType>().notNull(),
    // The load: weight for `weighted`, added weight for `bodyweight_plus`, assistance for `assisted`.
    weight: real('weight'),
    weightUnit: text('weight_unit').$type<WeightUnit>(),
    reps: integer('reps'),
    // 6 to 10 in steps of 0.5.
    rpe: real('rpe'),
    durationS: integer('duration_s'),
    distance: real('distance'),
    distanceUnit: text('distance_unit').$type<DistanceUnit>(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    // Bitmask: 1 heaviest, 2 reps at weight, 4 estimated 1RM, 8 longest hold.
    prFlags: integer('pr_flags').notNull().default(0),
    completedAt: integer('completed_at'),
  },
  (t) => [index('sets_workout_exercise_id_idx').on(t.workoutExerciseId)],
);

export const bodyweight = sqliteTable(
  'bodyweight',
  {
    id: text('id').primaryKey(),
    localDate: text('local_date').notNull(),
    measuredAt: integer('measured_at').notNull(),
    weight: real('weight').notNull(),
    unit: text('unit').$type<WeightUnit>().notNull(),
  },
  (t) => [index('bodyweight_local_date_idx').on(t.localDate)],
);

export const foods = sqliteTable('foods', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // e.g. "1 large egg", "100 g".
  servingLabel: text('serving_label').notNull(),
  servingGrams: real('serving_grams'),
  // Macros are per serving.
  kcal: real('kcal').notNull(),
  proteinG: real('protein_g').notNull(),
  carbsG: real('carbs_g').notNull(),
  fatG: real('fat_g').notNull(),
  source: text('source').$type<FoodSource>().notNull(),
  // The scanner seam.
  barcode: text('barcode'),
  archived: integer('archived', { mode: 'boolean' }).notNull(),
});

export const foodLog = sqliteTable(
  'food_log',
  {
    id: text('id').primaryKey(),
    localDate: text('local_date').notNull(),
    loggedAt: integer('logged_at').notNull(),
    // Null for quick add.
    foodId: text('food_id'),
    name: text('name').notNull(),
    servings: real('servings').notNull(),
    // The entry's totals, copied at the time, so editing a custom food never rewrites past days.
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbsG: real('carbs_g').notNull(),
    fatG: real('fat_g').notNull(),
  },
  (t) => [index('food_log_local_date_idx').on(t.localDate)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  // A JSON value. SQL NULL stands for JSON null.
  value: text('value', { mode: 'json' }).$type<unknown>(),
});
