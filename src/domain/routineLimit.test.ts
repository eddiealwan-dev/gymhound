import { PROGRAMS } from '../seed/programs.generated';
import {
  canAddRoutine,
  canSeeProgramExercises,
  canUseRoutine,
  canUseSavedWorkouts,
  FREE_PREMADES,
  FREE_PROGRAMS_TEXT,
  FREE_ROUTINE_LIMIT,
  LEGACY_FREE_PREMADES,
  lockedRoutineReason,
  proReasonText,
} from './routineLimit';

const FREE_FIVE = [
  'program-barbell-foundations',
  'program-dumbbell-full-body',
  'program-minimalist-two-day',
  'program-crossfit-foundations',
  'program-mobility-for-lifters',
];

describe('what free and Pro hold (§18.21, §18.29)', () => {
  it("free: the five run, the fifteen don't, a retired free program still runs on free", () => {
    expect(FREE_PREMADES).toEqual(FREE_FIVE);
    expect([...FREE_PREMADES].sort()).toEqual(PROGRAMS.filter((p) => p.free).map((p) => p.id).sort());
    for (const id of FREE_PREMADES) expect([id, canUseRoutine({ id, isPremade: true }, false)]).toEqual([id, true]);
    const pro = PROGRAMS.filter((p) => !FREE_FIVE.includes(p.id)).map((p) => p.id);
    expect(pro).toHaveLength(15);
    for (const id of pro) {
      expect([id, canUseRoutine({ id, isPremade: true }, false)]).toEqual([id, false]);
      expect([id, canUseRoutine({ id, isPremade: true }, true)]).toEqual([id, true]);
    }
    // R599: the four free held before keep running on free for whoever still has them; a retired Pro one follows R526.
    expect(LEGACY_FREE_PREMADES).toEqual(['premade-fullbody-3', 'premade-5x5-3', 'premade-dumbbell-3', 'premade-mobility-3']);
    for (const id of LEGACY_FREE_PREMADES) expect([id, canUseRoutine({ id, isPremade: true }, false)]).toEqual([id, true]);
    for (const id of ['premade-ppl-6', 'premade-upperlower-4', 'premade-advancedfullbody-4', 'premade-brosplit-5', 'premade-calisthenics-3']) {
      expect([id, canUseRoutine({ id, isPremade: true }, false)]).toEqual([id, false]);
      expect([id, canUseRoutine({ id, isPremade: true }, true)]).toEqual([id, true]);
    }
    // A routine of your own under a free program's id is still your own.
    expect(canUseRoutine({ id: 'program-barbell-foundations', isPremade: false }, false)).toBe(false);
  });

  it('canSeeProgramExercises: inactive → false; active free on free → true; active Pro on free → false; your own routine → true', () => {
    const program = (id: string, isActive: boolean) => ({ id, isPremade: true, isActive });
    expect(canSeeProgramExercises(program('program-barbell-foundations', false), false)).toBe(false);
    expect(canSeeProgramExercises(program('program-barbell-foundations', false), true)).toBe(false);
    expect(canSeeProgramExercises(program('program-barbell-foundations', true), false)).toBe(true);
    expect(canSeeProgramExercises(program('program-bro-split', true), false)).toBe(false);
    expect(canSeeProgramExercises(program('program-bro-split', true), true)).toBe(true);
    expect(canSeeProgramExercises(program('program-bro-split', false), true)).toBe(false);
    expect(canSeeProgramExercises({ id: 'mine', isPremade: false, isActive: false }, false)).toBe(true);
    expect(canSeeProgramExercises({ id: 'mine', isPremade: false, isActive: true }, true)).toBe(true);
    // A retired program is not one of the twenty: its days show as they always did (R598).
    expect(canSeeProgramExercises(program('premade-ppl-6', false), false)).toBe(true);
    expect(canSeeProgramExercises(program('premade-fullbody-3', false), true)).toBe(true);
  });

  it('names the free five for the sheet (R638)', () => {
    expect(FREE_PROGRAMS_TEXT).toBe('Barbell Foundations, Dumbbell Full Body, Minimalist Two-Day, CrossFit Foundations and Mobility for Lifters');
    expect(FREE_PROGRAMS_TEXT).toBe(
      `${FREE_FIVE.slice(0, 4).map((id) => PROGRAMS.find((p) => p.id === id)!.name).join(', ')} and ${PROGRAMS.find((p) => p.id === FREE_FIVE[4])!.name}`,
    );
  });

  it('free makes and uses no routines of its own; Pro as many as you like (R521, R523)', () => {
    expect(FREE_ROUTINE_LIMIT).toBe(0);
    expect(canAddRoutine(0, false)).toBe(false);
    expect(canAddRoutine(12, true)).toBe(true);
    expect(canUseRoutine({ id: 'mine', isPremade: false }, false)).toBe(false);
    expect(canUseRoutine({ id: 'mine', isPremade: false }, true)).toBe(true);
  });

  it('saved workouts are Pro (R522)', () => {
    expect(canUseSavedWorkouts(false)).toBe(false);
    expect(canUseSavedWorkouts(true)).toBe(true);
  });

  it('says why in plain words (R524)', () => {
    expect(proReasonText({ kind: 'own_routine' })).toBe('Routines of your own are part of GymHound Pro.');
    expect(proReasonText(lockedRoutineReason({ name: 'Push/pull/legs', isPremade: true }))).toBe(
      'Push/pull/legs is part of GymHound Pro. Free includes Barbell Foundations, Dumbbell Full Body, Minimalist Two-Day, CrossFit Foundations and Mobility for Lifters.',
    );
    expect(proReasonText(lockedRoutineReason({ name: 'My split', isPremade: false }))).toBe("My split is kept. It's ready to use again with GymHound Pro.");
    expect(proReasonText({ kind: 'saved_workout' })).toBe('Saved workouts are part of GymHound Pro.');
  });
});
