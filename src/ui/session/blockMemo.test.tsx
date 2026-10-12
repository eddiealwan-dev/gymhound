import type { SetView, WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { blockPropsEqual, type ExerciseBlockProps } from './ExerciseBlock';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));

/** Whether a session block draws again for a change: the memo's comparison (R406). */

const set = (id: string, done = false): SetView => ({
  id,
  position: 0,
  setType: 'working',
  weight: 100,
  weightUnit: 'lb',
  reps: 5,
  rpe: null,
  durationS: null,
  distance: null,
  distanceUnit: null,
  done,
  completedAt: done ? 1 : null,
});

const ex: WorkoutExerciseView = {
  id: 'we1',
  exerciseId: 'barbell-bench-press',
  name: 'Bench Press',
  loggingType: 'weighted',
  equipment: 'barbell',
  position: 0,
  supersetGroup: null,
  showRpe: false,
  note: null,
  restSeconds: null,
  rule: null,
  plannedWeight: null,
  plannedUnit: null,
  overrideWeight: null,
  overrideUnit: null,
  mark: null,
  sets: [set('a1', true), set('a2')],
  previous: [],
};

const handlers = { onOpenMenu: () => {}, onOpenRest: () => {}, onOpenMark: () => {} };
const base: ExerciseBlockProps = {
  workoutId: 'w1',
  ex,
  unit: 'lb',
  gear: { bar: 45, plates: { '45': 2, '25': 2 } },
  distanceUnit: 'mi',
  inSuperset: false,
  joinsNext: false,
  supersetLabel: null,
  restWaitsFor: null,
  latestTickedSetId: null,
  restEndsAt: null,
  restSetId: null,
  nextSetId: null,
  restUp: null,
  upText: "Rest's up",
  settingsRestSeconds: 90,
  ...handlers,
};
const same = (change: Partial<ExerciseBlockProps>, from: Partial<ExerciseBlockProps> = {}) =>
  blockPropsEqual({ ...base, ...from }, { ...base, ...from, ...change });

describe('a session block draws again only when what it shows changed (R406)', () => {
  it('does not for the same props', () => {
    expect(same({})).toBe(true);
  });

  it('does for a changed exercise, unit, gear or callback', () => {
    expect(same({ ex: { ...ex } })).toBe(false);
    expect(same({ unit: 'kg' })).toBe(false);
    expect(same({ gear: { ...base.gear } })).toBe(false);
    expect(same({ onOpenMenu: () => {} })).toBe(false);
    expect(same({ settingsRestSeconds: 120 })).toBe(false);
  });

  it('does not when the next set moves between other blocks, and does when it comes, goes or moves within', () => {
    expect(same({ nextSetId: 'b2' }, { nextSetId: 'b1' })).toBe(true);
    expect(same({ nextSetId: 'a2' }, { nextSetId: 'b1' })).toBe(false);
    expect(same({ nextSetId: 'b1' }, { nextSetId: 'a2' })).toBe(false);
    expect(same({ nextSetId: 'a2' }, { nextSetId: 'a1' })).toBe(false);
    expect(same({ nextSetId: null }, { nextSetId: 'b1' })).toBe(true);
  });

  it('does not when the set ticked last moves between other blocks, and does when it touches this one', () => {
    expect(same({ latestTickedSetId: 'b2' }, { latestTickedSetId: 'b1' })).toBe(true);
    expect(same({ latestTickedSetId: 'a1' }, { latestTickedSetId: 'b1' })).toBe(false);
    expect(same({ latestTickedSetId: 'b1' }, { latestTickedSetId: 'a1' })).toBe(false);
  });

  it('does not for a rest running under another block, nor for its +15s', () => {
    expect(same({ restEndsAt: 5_000, restSetId: 'b1' })).toBe(true);
    expect(same({ restEndsAt: 20_000 }, { restEndsAt: 5_000, restSetId: 'b1' })).toBe(true);
    expect(same({ restEndsAt: null, restSetId: null }, { restEndsAt: 5_000, restSetId: 'b1' })).toBe(true);
  });

  it('does for a rest that starts, changes or ends under its own set', () => {
    expect(same({ restEndsAt: 5_000, restSetId: 'a1' })).toBe(false);
    expect(same({ restEndsAt: 20_000 }, { restEndsAt: 5_000, restSetId: 'a1' })).toBe(false);
    expect(same({ restEndsAt: null, restSetId: null }, { restEndsAt: 5_000, restSetId: 'a1' })).toBe(false);
  });

  it("does when its own Rest's up comes or goes, and not for another block's", () => {
    expect(same({ restUp: { setId: 'a1', endsAt: 5_000 } })).toBe(false);
    expect(same({ restUp: null }, { restUp: { setId: 'a1', endsAt: 5_000 } })).toBe(false);
    expect(same({ restUp: { setId: 'b1', endsAt: 5_000 } })).toBe(true);
  });

  it("does when a rest elsewhere starts or ends while its own Rest after line could show (R100)", () => {
    const waiting = { restWaitsFor: 'Squat', latestTickedSetId: 'a1' };
    expect(same({ restEndsAt: 5_000, restSetId: 'b1' }, waiting)).toBe(false);
    expect(same({ restEndsAt: null, restSetId: null }, { ...waiting, restEndsAt: 5_000, restSetId: 'b1' })).toBe(false);
  });

  it('counts the words at zero only where a rest row shows', () => {
    expect(same({ upText: "Rest's up · Set 2 next" })).toBe(true);
    expect(same({ upText: "Rest's up · Set 2 next" }, { restEndsAt: 5_000, restSetId: 'a1' })).toBe(false);
    expect(same({ upText: "Rest's up · Set 2 next" }, { restUp: { setId: 'a1', endsAt: 5_000 } })).toBe(false);
  });
});
