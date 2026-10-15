/** @jest-environment node */
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { setRestSeconds } from '../db/repositories/exercisePrefsRepo';
import { setActiveProgram } from '../db/repositories/programRunRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { startWorkoutFromDay } from '../db/repositories/workoutsRepo';
import { seededDb } from '../db/testing/fixtures';
import { insertProgram } from '../db/testing/programFixture';
import type { Db } from '../db/types';
import { workPlanFor } from '../domain/sessionBlock';
import { clockAt, LEAD_IN_MS } from '../domain/workClock';
import { commitSetField, discard, finish, removeFromWorkout, replaceWith, tick } from './sessionActions';
import {
  doneWorkClock,
  pauseWorkClock,
  releaseWorkHold,
  resetWorkClock,
  resumeWorkClock,
  startWorkClock,
  workCueDealtWith,
} from './workClockActions';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

const mockRest = { start: jest.fn(() => Promise.resolve()), update: jest.fn(() => Promise.resolve()), cancel: jest.fn(() => Promise.resolve()), ended: jest.fn(() => Promise.resolve()) };
const mockCues = {
  schedule: jest.fn((_cues: readonly { at: number; title: string }[], _withSound: boolean, _sound?: string) => Promise.resolve()),
  cancel: jest.fn(() => Promise.resolve()),
};
jest.mock('../platform/restTimer', () => ({ getRestTimerSurface: () => mockRest, getWorkCueSurface: () => mockCues }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('./nativeServices', () => ({ afterFinish: jest.fn(), healthRecordBeforeDelete: jest.fn(() => null), afterHistoryDelete: jest.fn() }));
jest.mock('./backup', () => ({ takeSnapshotSafely: jest.fn(() => true) }));

const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const DAY = 24 * 3_600_000;

let db: Db;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  db = seededDb();
  Object.values(mockRest).forEach((f) => f.mockClear());
  mockCues.schedule.mockClear();
  mockCues.cancel.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Starts the day of a program, the program active, and returns its exercises as the session sees them. */
function startDay(program: string, slug: string) {
  insertProgram(db, program);
  setActiveProgram(db, program, NOW - DAY);
  startWorkoutFromDay(db, `${program}:${slug}`, NOW);
  return exercisesNow();
}
const exercisesNow = () => getActiveWorkoutView(db)!.exercises;
const workoutId = () => getActiveWorkoutView(db)!.id;
const restEndsAt = () => getActiveWorkoutView(db)!.restEndsAt;
const timer = () => getSettings(db).workTimer;
const at = (ms: number) => jest.setSystemTime(NOW + ms);

/** Ticks a set of an exercise, by its position, as the row would: with its suggestions. */
function tickSetOf(index: number, setIndex: number, entered: Partial<Record<'weight' | 'reps' | 'durationS' | 'distance' | 'extraReps', number>> = {}) {
  const ex = exercisesNow()[index];
  return tick(db, ex, ex.sets[setIndex], { weight: null, reps: null, durationS: null, distance: null, ...entered });
}

describe('the rest after a tick, by type (R639)', () => {
  it('rests 150 s after the first slot of a program day', () => {
    startDay('program-crossfit-foundations', 'a');
    tickSetOf(0, 0, { weight: 95, reps: 5 });
    expect(restEndsAt()).toBe(NOW + 150_000);
  });

  it('rests 75 s after an isolation move, and the lifter\'s own rest wins', () => {
    const [, , , , raise] = startDay('program-crossfit-foundations', 'a');
    tickSetOf(4, 0, { weight: 15, reps: 12 });
    expect(restEndsAt()).toBe(NOW + 75_000);
    setRestSeconds(db, raise.exerciseId, 40, NOW);
    tickSetOf(4, 1, { weight: 15, reps: 12 });
    expect(restEndsAt()).toBe(NOW + 40_000);
  });

  it('starts no rest after a metcon score, and leaves the one running as it was', () => {
    startDay('program-crossfit-foundations', 'a');
    tickSetOf(0, 0, { weight: 95, reps: 5 });
    expect(restEndsAt()).not.toBeNull();
    tickSetOf(3, 0, { reps: 5, extraReps: 4 });
    expect(exercisesNow()[3].sets[0].done).toBe(true);
    expect(restEndsAt()).toBe(NOW + 150_000);
  });

  it('starts no rest after a run, even with a rest of its own', () => {
    const [warm] = startDay('program-hybrid-athlete', 'fri-tempo-run');
    setRestSeconds(db, warm.exerciseId, 90, NOW);
    tickSetOf(0, 0);
    expect(exercisesNow()[0].sets[0].done).toBe(true);
    expect(restEndsAt()).toBeNull();
  });

  it('rests 150 s after a carry', () => {
    startDay('program-strongman-prep', 'sat-events-b');
    tickSetOf(0, 0, { weight: 150, distance: 50 });
    expect(restEndsAt()).toBe(NOW + 150_000);
  });
});

describe('the work clock (Task 7b)', () => {
  const metconPlan = () => workPlanFor({ ...exercisesNow()[3], program: exercisesNow()[3].program })!;

  it('starts from a stored start time, skips a running rest and schedules its cues', () => {
    startDay('program-crossfit-foundations', 'a');
    tickSetOf(0, 0, { weight: 95, reps: 5 });
    startWorkClock(db, workoutId(), exercisesNow()[3].id, metconPlan());
    expect(timer()).toMatchObject({ workoutExerciseId: exercisesNow()[3].id, startsAt: NOW + LEAD_IN_MS, pausedAt: null });
    expect(restEndsAt()).toBeNull();
    expect(mockRest.cancel).toHaveBeenCalled();
    const [cues] = mockCues.schedule.mock.calls[0];
    expect(cues.map((c) => c.title)).toEqual(['Go.', 'Time.']);
    expect(cues[1].at).toBe(NOW + LEAD_IN_MS + 600_000);
  });

  it('survives a lock: the clock is worked out again from the stored start', () => {
    startDay('program-crossfit-foundations', 'a');
    startWorkClock(db, workoutId(), exercisesNow()[3].id, metconPlan());
    at(LEAD_IN_MS + 250_000);
    // The app comes back: only what is stored is read.
    expect(clockAt(timer()!, Date.now())).toMatchObject({ phase: 'running', shown: 350 });
  });

  it('pauses (cancelling the cues) and resumes (scheduling them again, later by the pause)', () => {
    startDay('program-crossfit-foundations', 'a');
    startWorkClock(db, workoutId(), exercisesNow()[3].id, metconPlan());
    at(LEAD_IN_MS + 100_000);
    pauseWorkClock(db);
    expect(timer()?.pausedAt).toBe(NOW + LEAD_IN_MS + 100_000);
    expect(mockCues.cancel).toHaveBeenCalled();
    at(LEAD_IN_MS + 160_000);
    resumeWorkClock(db);
    const cues = mockCues.schedule.mock.calls.at(-1)![0];
    expect(cues).toEqual([{ at: NOW + LEAD_IN_MS + 660_000, title: 'Time.' }]);
  });

  it('Done on For Time writes the time into the score, entered and not ticked', () => {
    startDay('program-crossfit-foundations', 'b');
    const fran = exercisesNow()[3];
    startWorkClock(db, workoutId(), fran.id, workPlanFor(fran)!);
    at(LEAD_IN_MS + 462_400);
    doneWorkClock(db);
    const score = exercisesNow()[3].sets[0];
    expect(score).toMatchObject({ durationS: 462, done: false });
    expect(timer()?.doneAtS).toBe(462);
    expect(mockCues.cancel).toHaveBeenCalled();
  });

  it('the cap writes the cap as the time when the end is dealt with (R647), never over a time typed', () => {
    startDay('program-crossfit-foundations', 'b');
    const metcon = exercisesNow()[3];
    startWorkClock(db, workoutId(), metcon.id, workPlanFor(metcon)!);
    at(LEAD_IN_MS + 720_000);
    workCueDealtWith(db, 3, 'end');
    expect(timer()?.rang).toBe(3);
    expect(exercisesNow()[3].sets[0].durationS).toBe(720);
    commitSetField(db, exercisesNow()[3].sets[0].id, { durationS: 700 });
    workCueDealtWith(db, 3, 'end');
    expect(exercisesNow()[3].sets[0].durationS).toBe(700);
  });

  it('ticking the score takes the clock away', () => {
    startDay('program-crossfit-foundations', 'a');
    startWorkClock(db, workoutId(), exercisesNow()[3].id, metconPlan());
    at(LEAD_IN_MS + 600_000);
    tickSetOf(3, 0, { reps: 6 });
    expect(timer()).toBeNull();
    expect(mockCues.cancel).toHaveBeenCalled();
  });

  it('starts no rest after a tick while an EMOM runs: the minute is the rest', () => {
    const [snatch] = startDay('program-crossfit-performance', 'wed-olympic-squat');
    startWorkClock(db, workoutId(), snatch.id, workPlanFor(snatch)!);
    at(LEAD_IN_MS + 20_000);
    tickSetOf(0, 0, { weight: 65, reps: 2 });
    expect(restEndsAt()).toBeNull();
    resetWorkClock(db);
    tickSetOf(0, 1, { weight: 65, reps: 2 });
    expect(restEndsAt()).toBe(Date.now() + 150_000);
  });

  it('releases a hold between intervals with Start', () => {
    startDay('program-hybrid-athlete', 'wed-intervals');
    const plan = { kind: 'intervals' as const, noun: 'Intervals', steps: [{ kind: 'work' as const, seconds: 60, set: 1, holdAfter: true }, { kind: 'work' as const, seconds: 60, set: 2 }] };
    startWorkClock(db, workoutId(), exercisesNow()[1].id, plan);
    at(LEAD_IN_MS + 90_000);
    releaseWorkHold(db);
    expect(timer()?.released).toBe(1);
    expect(clockAt(timer()!, Date.now())).toMatchObject({ phase: 'running', shown: 60 });
  });

  it('Reset, Finish, Discard, Remove and Replace take the clock away and its cues down', () => {
    startDay('program-crossfit-foundations', 'a');
    const id = exercisesNow()[3].id;
    const plan = metconPlan();
    const restart = () => {
      startWorkClock(db, workoutId(), id, plan);
      mockCues.cancel.mockClear();
    };
    restart();
    resetWorkClock(db);
    expect(timer()).toBeNull();
    expect(mockCues.cancel).toHaveBeenCalled();

    restart();
    replaceWith(db, exercisesNow()[4].id, 'dumbbell-curl');
    expect(timer()).not.toBeNull();
    removeFromWorkout(db, id);
    expect(timer()).toBeNull();
    expect(mockCues.cancel).toHaveBeenCalled();

    setSetting(db, 'workTimer', null);
    startWorkClock(db, workoutId(), exercisesNow()[0].id, plan);
    replaceWith(db, exercisesNow()[0].id, 'barbell-front-squat');
    expect(timer()).toBeNull();

    startWorkClock(db, workoutId(), exercisesNow()[0].id, plan);
    mockCues.cancel.mockClear();
    tickSetOf(1, 0, { weight: 65, reps: 5 });
    finish(db, workoutId());
    expect(timer()).toBeNull();
    expect(mockCues.cancel).toHaveBeenCalled();
  });

  it('Discard takes it away too', () => {
    startDay('program-crossfit-foundations', 'a');
    startWorkClock(db, workoutId(), exercisesNow()[3].id, metconPlan());
    mockCues.cancel.mockClear();
    discard(db, workoutId());
    expect(timer()).toBeNull();
    expect(mockCues.cancel).toHaveBeenCalled();
  });
});
