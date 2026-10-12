/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { decodeRoutine, encodeRoutine, shareMessage, SHARE_CODE_ERRORS, signBody } from '../../domain/routineShare';
import type { SharedRoutine } from '../../domain/routineShare';
import { exercises, routines } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { createCustomExercise } from './customExercisesRepo';
import { getRestSeconds, setRestSeconds } from './exercisePrefsRepo';
import { importSharedRoutine, previewShared, sharedRoutineFor } from './routineShareRepo';
import { getRoutineDetail } from './routinesRepo';

const NOW = Date.UTC(2026, 9, 12);

/** What a routine is, leaving out ids: what must survive a trip through a code. */
function shape(db: Db, routineId: string) {
  const detail = getRoutineDetail(db, routineId)!;
  return detail.days.map((d) => ({
    name: d.name,
    exercises: d.exercises.map((e) => [e.exerciseId, e.setCount, e.repMin, e.repMax, e.increment, e.incrementUnit, e.supersetGroup]),
  }));
}

/** The routine through a code and back, on another phone. */
function roundTrip(from: Db, routineId: string, to: Db = seededDb()) {
  const code = encodeRoutine(sharedRoutineFor(from, routineId)!);
  const decoded = decodeRoutine(shareMessage('Mine', code));
  if (!decoded.ok) throw new Error(decoded.error);
  return { to, code, result: importSharedRoutine(to, decoded.routine, NOW) };
}

describe('routine sharing (§18.18)', () => {
  it('carries every premade through a code unchanged, as a routine of your own on the other phone', () => {
    const db = seededDb();
    for (const { id } of db.select({ id: routines.id }).from(routines).where(eq(routines.isPremade, true)).all()) {
      const { to, result } = roundTrip(db, id);
      expect([id, shape(to, result.routineId)]).toEqual([id, shape(db, id)]);
      expect(to.select().from(routines).where(eq(routines.id, result.routineId)).get()!.isPremade).toBe(false);
    }
  });

  it('keeps the Beginner full body code short enough to paste in a message', () => {
    const code = encodeRoutine(sharedRoutineFor(seededDb(), 'premade-fullbody-3')!);
    expect(code).toMatch(/^GH1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{4}$/);
    // About 430 characters: a long line in a message, but one paste.
    expect(code.length).toBeLessThan(600);
  });

  it('a name already in use gets " (2)", then " (3)" (R468)', () => {
    const db = seededDb();
    const shared = sharedRoutineFor(db, 'premade-fullbody-3')!;
    expect(importSharedRoutine(db, shared, NOW).name).toBe('Beginner full body (2)');
    expect(importSharedRoutine(db, shared, NOW).name).toBe('Beginner full body (3)');
  });

  it("carries an exercise of your own, made on the other phone, or matched there by name and type", () => {
    const from = seededDb();
    const press = createCustomExercise(from, { name: 'Landmine press', loggingType: 'weighted', equipment: 'barbell', primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps'] }, NOW);
    const shared = sharedRoutineFor(from, 'premade-fullbody-3')!;
    shared.days[0].slots[0].exercise = { custom: shared.customs.length };
    shared.customs.push({ name: 'Landmine press', loggingType: 'weighted', equipment: 'barbell', primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps'] });
    expect(press).toBeTruthy();

    const to = seededDb();
    expect(previewShared(to, shared).newExercises).toEqual(['Landmine press']);
    const decoded = decodeRoutine(encodeRoutine(shared));
    if (!decoded.ok) throw new Error(decoded.error);
    const first = importSharedRoutine(to, decoded.routine, NOW);
    const made = to.select().from(exercises).where(eq(exercises.name, 'Landmine press')).all();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ isCustom: true, equipment: 'barbell', primaryMuscles: ['front_delts'] });
    expect(getRoutineDetail(to, first.routineId)!.days[0].exercises[0].exerciseId).toBe(made[0].id);

    // A second import finds the one it made instead of making another.
    expect(previewShared(to, decoded.routine).newExercises).toEqual([]);
    importSharedRoutine(to, decoded.routine, NOW);
    expect(to.select().from(exercises).where(eq(exercises.name, 'Landmine press')).all()).toHaveLength(1);
  });

  it("sets a shared rest only where this phone has none, so your own rests never change", () => {
    const from = seededDb();
    const shared = sharedRoutineFor(from, 'premade-fullbody-3')!;
    const first = shared.days[0].slots[0];
    const second = shared.days[0].slots[1];
    first.restSeconds = 90;
    second.restSeconds = 180;
    const to = seededDb();
    const secondId = 'library' in second.exercise ? second.exercise.library : '';
    setRestSeconds(to, secondId, 60, NOW);
    importSharedRoutine(to, shared, NOW);
    expect(getRestSeconds(to, 'library' in first.exercise ? first.exercise.library : '')).toBe(90);
    expect(getRestSeconds(to, secondId)).toBe(60);
  });

  it('skips an exercise this library lacks and drops a day left empty, and counts them in the preview', () => {
    const db = seededDb();
    const shared: SharedRoutine = sharedRoutineFor(db, 'premade-fullbody-3')!;
    shared.days[0].slots = [{ ...shared.days[0].slots[0], exercise: { missing: 99_000 } }];
    const preview = previewShared(db, shared);
    expect(preview.missingCount).toBe(1);
    const result = importSharedRoutine(db, shared, NOW);
    expect(result.skipped).toBe(1);
    expect(getRoutineDetail(db, result.routineId)!.days).toHaveLength(shared.days.length - 1);
  });

  it('refuses a code in plain words: not a routine, cut short, or from a newer GymHound (R470)', () => {
    const code = encodeRoutine(sharedRoutineFor(seededDb(), 'premade-fullbody-3')!);
    expect(decodeRoutine('hello')).toEqual({ ok: false, error: 'not_routine' });
    expect(decodeRoutine(code.slice(0, code.lastIndexOf('.')))).toEqual({ ok: false, error: 'cut_short' });
    const flipped = code.replace(/\.(.)/, (_m, c: string) => `.${c === 'A' ? 'B' : 'A'}`);
    expect(decodeRoutine(flipped)).toEqual({ ok: false, error: 'not_routine' });
    expect(decodeRoutine(code.replace(/^GH1/, 'GH2'))).toEqual({ ok: false, error: 'newer_version' });
    expect(decodeRoutine(signBody(['x', 0, []]))).toEqual({ ok: false, error: 'not_routine' });
    expect(SHARE_CODE_ERRORS.cut_short).toBe('That code is cut short. Copy the whole code and try again.');
  });

  it('finds the code in a whole message, the link, or a code broken over lines', () => {
    const code = encodeRoutine(sharedRoutineFor(seededDb(), 'premade-ppl-6')!);
    expect(decodeRoutine(`gymhound://routine/${code}`).ok).toBe(true);
    expect(decodeRoutine(shareMessage('Push/pull/legs', code)).ok).toBe(true);
    const broken = `${code.slice(0, 40)}\n${code.slice(40)}`;
    expect(decodeRoutine(broken).ok).toBe(true);
  });

  it("the message names the routine, the link and the code on its own line (R465)", () => {
    const message = shareMessage(' Push/pull/legs ', 'GH1.abc.defg');
    expect(message).toBe(
      'My Push/pull/legs routine on GymHound. Open this link on your phone, or paste the code in Routines → Add from code: gymhound://routine/GH1.abc.defg\n\nCode: GH1.abc.defg',
    );
  });
});
