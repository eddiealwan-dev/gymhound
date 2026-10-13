import {
  canAddRoutine,
  canUseRoutine,
  canUseSavedWorkouts,
  FREE_PREMADES,
  FREE_ROUTINE_LIMIT,
  lockedRoutineReason,
  proReasonText,
} from './routineLimit';

describe('what free and Pro hold (§18.21)', () => {
  it("free uses four premade programs; Pro and the trial use all of them (R520)", () => {
    expect(FREE_PREMADES).toEqual(['premade-fullbody-3', 'premade-5x5-3', 'premade-dumbbell-3', 'premade-mobility-3']);
    for (const id of FREE_PREMADES) expect(canUseRoutine({ id, isPremade: true }, false)).toBe(true);
    for (const id of ['premade-ppl-6', 'premade-upperlower-4', 'premade-advancedfullbody-4', 'premade-brosplit-5', 'premade-calisthenics-3']) {
      expect([id, canUseRoutine({ id, isPremade: true }, false)]).toEqual([id, false]);
      expect([id, canUseRoutine({ id, isPremade: true }, true)]).toEqual([id, true]);
    }
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
      'Push/pull/legs is part of GymHound Pro. Free includes Beginner full body, 5×5, Dumbbell full body and Mobility.',
    );
    expect(proReasonText(lockedRoutineReason({ name: 'My split', isPremade: false }))).toBe("My split is kept. It's ready to use again with GymHound Pro.");
    expect(proReasonText({ kind: 'saved_workout' })).toBe('Saved workouts are part of GymHound Pro.');
  });
});
