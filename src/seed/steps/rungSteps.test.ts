import { RUNG_NEW, RUNG_NEW_IDS } from '../newExerciseData';
import { RUNG_STEPS } from './rungSteps';

const byId = new Map(RUNG_NEW.map((e) => [e.id, e]));
const NEGATIVES = ['negative-pull-up', 'negative-dip', 'negative-muscle-up', 'eccentric-nordic-curl'];
const HOLD_IDS = RUNG_NEW_IDS.filter((id) => byId.get(id)!.loggingType === 'timed');

describe('the ladder rungs\' steps (R604)', () => {
  it('has steps for exactly the 59 new rungs', () => {
    expect(RUNG_NEW_IDS).toHaveLength(59);
    expect(Object.keys(RUNG_STEPS).sort()).toEqual([...RUNG_NEW_IDS].sort());
  });

  it('gives every rung-new id 2–4 steps', () => {
    for (const id of RUNG_NEW_IDS) {
      const n = (RUNG_STEPS[id] ?? []).length;
      expect([id, n >= 2 && n <= 4]).toEqual([id, true]);
    }
  });

  it('writes each step as a plain sentence in GymHound\'s voice', () => {
    for (const id of RUNG_NEW_IDS) {
      for (const step of RUNG_STEPS[id] ?? []) {
        expect([id, step.trim() === step && step.length > 0]).toEqual([id, true]);
        expect([id, /[.]$/.test(step)]).toEqual([id, true]);
        expect([id, /^[A-Z0-9]/.test(step)]).toEqual([id, true]);
        expect([id, /[!‘’“”–—]/.test(step)]).toEqual([id, false]);
        expect([id, /\b(notices?|detects?|decides?|automatically|guarantee[sd]?|prevents?|injur\w*|safe|safely)\b/i.test(step)]).toEqual([id, false]);
        expect([id, step.length <= 260]).toEqual([id, true]);
      }
    }
  });

  it('has no repeated step within an exercise', () => {
    for (const id of RUNG_NEW_IDS) {
      const steps = RUNG_STEPS[id] ?? [];
      expect([id, new Set(steps).size]).toEqual([id, steps.length]);
    }
  });

  it('says for every hold how to hold and when the time counts', () => {
    expect(HOLD_IDS).toHaveLength(20);
    for (const id of HOLD_IDS) {
      const text = (RUNG_STEPS[id] ?? []).join(' ');
      expect([id, /\bhold\b/i.test(text)]).toEqual([id, true]);
      expect([id, /\bcounts?\b/i.test(text)]).toEqual([id, true]);
    }
  });

  it('says for every negative to lower for 3 to 5 seconds', () => {
    for (const id of NEGATIVES) {
      expect(byId.has(id)).toBe(true);
      const text = (RUNG_STEPS[id] ?? []).join(' ');
      expect([id, /lower[^.]*3 to 5 seconds/i.test(text)]).toEqual([id, true]);
    }
  });
});
