/** @jest-environment node */
import type { ExerciseMark, SetType } from '../../domain/types';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getLift, liftSessions, listLifts } from './liftsRepo';
import { addExerciseToWorkout, addSet, setExerciseMark, updateSet } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const BENCH = 'barbell-bench-press';
const SQUAT = 'barbell-back-squat';
const ROW = 'barbell-row';
const PLANK = 'plank';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OCT_1 = new Date(2026, 9, 1, 9, 0).getTime();

/** A set to tick: weight × reps in lb, or a hold, of `type` (working by default). */
type Lift = { weight?: number; reps?: number; durationS?: number; type?: SetType };
const lb = (weight: number, reps: number, type: SetType = 'working'): Lift => ({ weight, reps, type });
type Block = [exerciseId: string, lifts: Lift[], mark?: ExerciseMark];

/** Starts an empty workout at `start`, ticks each block's sets a minute apart, and finishes it unless `finish` is false. */
function workout(db: Db, start: number, blocks: Block[], finish = true): string {
  const id = startEmptyWorkout(db, start);
  let at = start;
  for (const [exerciseId, lifts, mark] of blocks) {
    const weId = addExerciseToWorkout(db, id, exerciseId);
    if (mark) setExerciseMark(db, weId, mark);
    for (let i = 1; i < lifts.length; i++) addSet(db, weId);
    const setIds = getActiveWorkoutView(db)!.exercises.find((e) => e.id === weId)!.sets.map((s) => s.id);
    lifts.forEach((lift, i) => {
      if (lift.type && lift.type !== 'working') updateSet(db, setIds[i], { setType: lift.type });
      tickSet(
        db,
        setIds[i],
        { weight: lift.weight ?? null, reps: lift.reps ?? null, durationS: lift.durationS ?? null, distance: null },
        'lb',
        (at += MINUTE),
        'mi',
      );
    });
  }
  if (finish) finishWorkout(db, id, start + 60 * MINUTE);
  return id;
}

describe('listLifts', () => {
  it('lists exercises with a done non-warmup set in a finished workout, newest last date first, then name', () => {
    const db = seededDb();
    workout(db, OCT_1, [[SQUAT, [lb(225, 5)]], [BENCH, [lb(135, 5)]]]);
    workout(db, OCT_1 + 2 * DAY, [[BENCH, [lb(140, 5)]], [ROW, [lb(95, 45, 'warmup')]]]);
    workout(db, OCT_1 + 3 * DAY, [[PLANK, [{ durationS: 60 }]]], false); // active

    expect(listLifts(db)).toEqual([
      { exerciseId: BENCH, name: expect.any(String), loggingType: 'weighted', lastDate: '2026-10-03', sessionCount: 2 },
      { exerciseId: SQUAT, name: expect.any(String), loggingType: 'weighted', lastDate: '2026-10-01', sessionCount: 1 },
    ]);
  });

  it('orders lifts with the same last date by name', () => {
    const db = seededDb();
    workout(db, OCT_1, [[SQUAT, [lb(225, 5)]], [BENCH, [lb(135, 5)]], [ROW, [lb(95, 8)]]]);
    const names = listLifts(db).map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toHaveLength(3);
  });

  it('is empty with no finished workouts', () => {
    expect(listLifts(seededDb())).toEqual([]);
  });
});

describe('getLift', () => {
  it('returns the exercise, or null for an unknown id', () => {
    const db = seededDb();
    expect(getLift(db, BENCH)).toEqual({ id: BENCH, name: expect.any(String), loggingType: 'weighted', equipment: 'barbell' });
    expect(getLift(db, 'nope')).toBeNull();
  });
});

describe('liftSessions (R173)', () => {
  it('returns one session per finished workout, oldest first, with its mark, outcome and working weight', () => {
    const db = seededDb();
    const first = workout(db, OCT_1, [[BENCH, [lb(135, 5), lb(135, 5)]]]);
    const second = workout(db, OCT_1 + 2 * DAY, [[BENCH, [lb(140, 5)], 'rough_sleep']]);
    workout(db, OCT_1 + 3 * DAY, [[BENCH, [lb(95, 10, 'warmup')]]]); // warmups only: not a session
    workout(db, OCT_1 + 4 * DAY, [[BENCH, [lb(145, 5)]]], false); // active, not in history

    const sessions = liftSessions(db, BENCH);
    expect(sessions.map((s) => [s.workoutId, s.localDate, s.mark, s.outcome, s.workingWeight, s.workingUnit, s.hasRule])).toEqual([
      [first, '2026-10-01', null, 'no_rule', 135, 'lb', false],
      [second, '2026-10-03', 'rough_sleep', 'no_rule', 140, 'lb', false],
    ]);
    expect(sessions[0].sets).toHaveLength(2);
    expect(sessions[0].sets[0]).toEqual({
      setType: 'working',
      done: true,
      weight: 135,
      weightUnit: 'lb',
      reps: 5,
      durationS: null,
      distance: null,
      distanceUnit: null,
      extraReps: null,
    });
  });

  it('an exercise twice in a workout is one session: the first block with a working weight, every block\'s sets', () => {
    const db = seededDb();
    const id = workout(db, OCT_1, [
      [BENCH, [lb(45, 10, 'warmup')], 'pain'],
      [SQUAT, [lb(225, 5)]],
      [BENCH, [lb(135, 5), lb(135, 6)]],
    ]);

    const sessions = liftSessions(db, BENCH);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ workoutId: id, mark: null, workingWeight: 135, workingUnit: 'lb' });
    expect(sessions[0].sets.map((s) => [s.setType, s.weight, s.reps])).toEqual([
      ['warmup', 45, 10],
      ['working', 135, 5],
      ['working', 135, 6],
    ]);
  });

  it('a routine day\'s exercise has its rule and the outcome the rule wrote', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, 'premade-ppl-6:push-a', OCT_1);
    const bench = getActiveWorkoutView(db)!.exercises.find((e) => e.exerciseId === BENCH)!;
    bench.sets.forEach((s, i) =>
      tickSet(db, s.id, { weight: 135, reps: 3, durationS: null, distance: null }, 'lb', OCT_1 + (i + 1) * MINUTE, 'mi'),
    );
    finishWorkout(db, id, OCT_1 + 60 * MINUTE);

    expect(liftSessions(db, BENCH)).toEqual([
      expect.objectContaining({ workoutId: id, hasRule: true, ruleIncrement: expect.any(Number), outcome: 'held', workingWeight: 135, workingUnit: 'lb' }),
    ]);
  });

  it('is empty for an exercise never done', () => {
    expect(liftSessions(seededDb(), BENCH)).toEqual([]);
  });
});
