/** @jest-environment node */
import { and, eq } from 'drizzle-orm';
import type { FuelTargets } from '../../domain/types';
import { workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { flagUnmarkedShortOnFood, foodOfferDue, setFoodOfferShown } from './foodOfferRepo';
import { logQuickAdd, setFuelTargets } from './foodLogRepo';
import { addExerciseToWorkout, setExerciseMark } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const PUSH_A = 'premade-ppl-6:push-a';
const DAY = '2026-10-10';
const MIN = 60_000;
const AT_14 = new Date(2026, 9, 10, 14, 0).getTime();
const AT_0530 = new Date(2026, 9, 10, 5, 30).getTime();
const TARGETS: FuelTargets = {
  training: { kcal: 2600, protein: 180, carbs: null, fat: null },
  rest: { kcal: 2200, protein: 160, carbs: null, fat: null },
};

function protein(db: Db, grams: number, at: number, localDate = DAY): void {
  logQuickAdd(db, 'Meal', { kcal: 400, proteinG: grams, carbsG: 0, fatG: 0 }, localDate, at);
}

/** Pro, targets set, 30 g of protein logged before a 14:00 start (pace 0.5 of 180 g = 90 g): the offer is due. */
function dueSetup(): { db: Db; id: string } {
  const db = seededDb();
  setFuelTargets(db, TARGETS);
  protein(db, 30, AT_14 - 60 * MIN);
  const id = startWorkoutFromDay(db, PUSH_A, AT_14);
  return { db, id };
}

function marks(db: Db, workoutId: string): (string | null)[] {
  return db
    .select({ mark: workoutExercises.mark })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(workoutExercises.position)
    .all()
    .map((r) => r.mark);
}

function shown(db: Db, workoutId: string): boolean {
  return db.select({ s: workouts.foodOfferShown }).from(workouts).where(eq(workouts.id, workoutId)).get()!.s;
}

describe('foodOfferDue (§7.10, R152)', () => {
  it('is due with Pro, targets and 30 g logged before a 14:00 start against a 180 g target', () => {
    const { db, id } = dueSetup();
    expect(foodOfferDue(db, id, true)).toBe(true);
  });

  it('is not due with Pro off', () => {
    const { db, id } = dueSetup();
    expect(foodOfferDue(db, id, false)).toBe(false);
  });

  it('is not due once the offer was shown', () => {
    const { db, id } = dueSetup();
    setFoodOfferShown(db, id);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('is not due with no food logged that day', () => {
    const db = seededDb();
    setFuelTargets(db, TARGETS);
    protein(db, 30, AT_14 - 24 * 60 * MIN, '2026-10-09');
    const id = startWorkoutFromDay(db, PUSH_A, AT_14);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('is not due when the only food was logged after the start', () => {
    const db = seededDb();
    setFuelTargets(db, TARGETS);
    const id = startWorkoutFromDay(db, PUSH_A, AT_14);
    protein(db, 30, AT_14 + 5 * MIN);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('counts food logged at the start itself', () => {
    const db = seededDb();
    setFuelTargets(db, TARGETS);
    protein(db, 30, AT_14);
    const id = startWorkoutFromDay(db, PUSH_A, AT_14);
    expect(foodOfferDue(db, id, true)).toBe(true);
  });

  it('is not due for a start before 06:00 (pace 0)', () => {
    const db = seededDb();
    setFuelTargets(db, TARGETS);
    protein(db, 5, AT_0530 - 10 * MIN);
    const id = startWorkoutFromDay(db, PUSH_A, AT_0530);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('is not due without targets', () => {
    const db = seededDb();
    protein(db, 30, AT_14 - 60 * MIN);
    const id = startWorkoutFromDay(db, PUSH_A, AT_14);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('is not due with a training protein target of 0', () => {
    const db = seededDb();
    setFuelTargets(db, { ...TARGETS, training: { ...TARGETS.training, protein: 0 } });
    protein(db, 0, AT_14 - 60 * MIN);
    const id = startWorkoutFromDay(db, PUSH_A, AT_14);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('judges against the training protein target, not the rest one', () => {
    const db = seededDb();
    // Training 100 g × 0.5 = 50 g; rest 300 g × 0.5 = 150 g. 60 g is behind only the rest target.
    setFuelTargets(db, { training: { ...TARGETS.training, protein: 100 }, rest: { ...TARGETS.rest, protein: 300 } });
    protein(db, 60, AT_14 - 60 * MIN);
    const id = startWorkoutFromDay(db, PUSH_A, AT_14);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('is not due when protein is on pace', () => {
    const db = seededDb();
    setFuelTargets(db, TARGETS);
    protein(db, 100, AT_14 - 60 * MIN);
    const id = startWorkoutFromDay(db, PUSH_A, AT_14);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('is not due when an exercise is already Short on food', () => {
    const { db, id } = dueSetup();
    setExerciseMark(db, getActiveWorkoutView(db)!.exercises[1].id, 'short_on_food');
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('is still due when an exercise has another mark, such as Pain', () => {
    const { db, id } = dueSetup();
    setExerciseMark(db, getActiveWorkoutView(db)!.exercises[0].id, 'pain');
    expect(foodOfferDue(db, id, true)).toBe(true);
  });

  it('is not due while the workout has no exercise to flag', () => {
    const db = seededDb();
    setFuelTargets(db, TARGETS);
    protein(db, 30, AT_14 - 60 * MIN);
    const id = startEmptyWorkout(db, AT_14);
    expect(foodOfferDue(db, id, true)).toBe(false);
    addExerciseToWorkout(db, id, 'barbell-bench-press');
    expect(foodOfferDue(db, id, true)).toBe(true);
  });

  it('is not due for a finished or missing workout', () => {
    const { db, id } = dueSetup();
    expect(foodOfferDue(db, 'nope', true)).toBe(false);
    const setId = getActiveWorkoutView(db)!.exercises[0].sets[0].id;
    tickSet(db, setId, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', AT_14 + MIN, 'mi');
    finishWorkout(db, id, AT_14 + 60 * MIN);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('stays the same however late it is read: it is judged as of the start', () => {
    const { db, id } = dueSetup();
    // Food logged during the workout does not count, so the offer does not come and go while it is open.
    protein(db, 200, AT_14 + 30 * MIN);
    expect(foodOfferDue(db, id, true)).toBe(true);
  });
});

describe('flagUnmarkedShortOnFood (Mark it)', () => {
  it('flags every exercise with no mark, keeps Pain as Pain, and sets food_offer_shown in one go', () => {
    const { db, id } = dueSetup();
    const view = getActiveWorkoutView(db)!;
    expect(view.exercises.length).toBeGreaterThan(2);
    setExerciseMark(db, view.exercises[1].id, 'pain');

    const flagged = flagUnmarkedShortOnFood(db, id);

    expect(flagged).toBe(view.exercises.length - 1);
    expect(marks(db, id)).toEqual(view.exercises.map((_, i) => (i === 1 ? 'pain' : 'short_on_food')));
    expect(shown(db, id)).toBe(true);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });

  it('flags nothing once the offer was dismissed (× then Mark it in one quick double tap)', () => {
    const { db, id } = dueSetup();
    setFoodOfferShown(db, id);

    expect(flagUnmarkedShortOnFood(db, id)).toBe(0);

    expect(marks(db, id).every((m) => m === null)).toBe(true);
    expect(shown(db, id)).toBe(true);
  });

  it('flags nothing the second time: a double tap on Mark it marks once', () => {
    const { db, id } = dueSetup();
    expect(flagUnmarkedShortOnFood(db, id)).toBeGreaterThan(0);
    addExerciseToWorkout(db, id, 'pull-up');

    expect(flagUnmarkedShortOnFood(db, id)).toBe(0);

    expect(marks(db, id).at(-1)).toBeNull();
  });

  it('leaves exercises added afterwards unflagged', () => {
    const { db, id } = dueSetup();
    flagUnmarkedShortOnFood(db, id);
    const added = addExerciseToWorkout(db, id, 'pull-up');
    const row = db.select({ mark: workoutExercises.mark }).from(workoutExercises).where(eq(workoutExercises.id, added)).get()!;
    expect(row.mark).toBeNull();
  });

  it('touches no other workout', () => {
    const { db, id } = dueSetup();
    const setId = getActiveWorkoutView(db)!.exercises[0].sets[0].id;
    tickSet(db, setId, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', AT_14 + MIN, 'mi');
    finishWorkout(db, id, AT_14 + 60 * MIN);
    const second = startWorkoutFromDay(db, PUSH_A, AT_14 + 120 * MIN);
    flagUnmarkedShortOnFood(db, second);
    expect(marks(db, id).every((m) => m === null)).toBe(true);
    expect(shown(db, id)).toBe(false);
  });

  it('refuses a workout that is not active, changing nothing', () => {
    const { db, id } = dueSetup();
    const setId = getActiveWorkoutView(db)!.exercises[0].sets[0].id;
    tickSet(db, setId, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', AT_14 + MIN, 'mi');
    finishWorkout(db, id, AT_14 + 60 * MIN);
    expect(() => flagUnmarkedShortOnFood(db, id)).toThrow();
    expect(marks(db, id).every((m) => m === null)).toBe(true);
    expect(shown(db, id)).toBe(false);
  });

  it('holds the weight at finish: the flagged exercise is held_marked', () => {
    const { db, id } = dueSetup();
    const bench = getActiveWorkoutView(db)!.exercises[0];
    flagUnmarkedShortOnFood(db, id);
    for (const s of bench.sets) {
      tickSet(db, s.id, { weight: 135, reps: 20, durationS: null, distance: null }, 'lb', AT_14 + MIN, 'mi');
    }
    finishWorkout(db, id, AT_14 + 60 * MIN);
    const row = db
      .select()
      .from(workoutExercises)
      .where(and(eq(workoutExercises.workoutId, id), eq(workoutExercises.id, bench.id)))
      .get()!;
    expect(row).toMatchObject({ mark: 'short_on_food', outcome: 'held_marked' });
  });
});

describe('setFoodOfferShown (×)', () => {
  it('hides the offer for good and flags nothing', () => {
    const { db, id } = dueSetup();
    setFoodOfferShown(db, id);
    expect(shown(db, id)).toBe(true);
    expect(marks(db, id).every((m) => m === null)).toBe(true);
    expect(foodOfferDue(db, id, true)).toBe(false);
  });
});
