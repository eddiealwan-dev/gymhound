import {
  addDraftSet,
  draftLeavesNothing,
  draftProblems,
  isDraftDirty,
  patchDraftSet,
  removeDraftSet,
  setDraftMark,
  type DraftSet,
  type WorkoutDraft,
} from './historyDraft';

const set = (over: Partial<DraftSet> = {}): DraftSet => ({
  id: 's1',
  setType: 'working',
  weight: 100,
  weightUnit: 'kg',
  reps: 5,
  rpe: null,
  durationS: null,
  distance: null,
  distanceUnit: null,
  done: true,
  ...over,
});

function draft(): WorkoutDraft {
  return {
    workoutId: 'w1',
    name: 'Push A',
    exercises: [
      {
        workoutExerciseId: 'we1',
        exerciseId: 'barbell-bench-press',
        name: 'Barbell bench press',
        loggingType: 'weighted',
        showRpe: false,
        mark: null,
        sets: [set({ id: 's1' }), set({ id: 's2', reps: 4 })],
      },
      {
        workoutExerciseId: 'we2',
        exerciseId: 'plank',
        name: 'Plank',
        loggingType: 'timed',
        showRpe: false,
        mark: null,
        sets: [set({ id: 's3', weight: null, weightUnit: null, reps: null, durationS: 60 })],
      },
    ],
  };
}

describe('patchDraftSet', () => {
  it('changes one set and leaves the input as it was', () => {
    const d = draft();
    const next = patchDraftSet(d, 'we1', 1, { reps: 6 });
    expect(next.exercises[0].sets[1].reps).toBe(6);
    expect(d.exercises[0].sets[1].reps).toBe(4);
    expect(next.exercises[1]).toBe(d.exercises[1]);
  });

  it('ignores an index or exercise that is not there', () => {
    const d = draft();
    expect(patchDraftSet(d, 'we1', 5, { reps: 6 })).toEqual(d);
    expect(patchDraftSet(d, 'nope', 0, { reps: 6 })).toEqual(d);
  });
});

describe('addDraftSet', () => {
  it('adds an empty working set, not done, in the display units', () => {
    const next = addDraftSet(draft(), 'we1', 'lb', 'mi');
    expect(next.exercises[0].sets).toHaveLength(3);
    expect(next.exercises[0].sets[2]).toEqual({
      id: null,
      setType: 'working',
      weight: null,
      weightUnit: 'lb',
      reps: null,
      rpe: null,
      durationS: null,
      distance: null,
      distanceUnit: 'mi',
      done: false,
    });
  });
});

describe('removeDraftSet', () => {
  it('removes the set at the index', () => {
    const next = removeDraftSet(draft(), 'we1', 0);
    expect(next.exercises[0].sets.map((s) => s.id)).toEqual(['s2']);
  });
});

describe('setDraftMark', () => {
  it('sets and clears the mark of one exercise', () => {
    const marked = setDraftMark(draft(), 'we1', 'pain');
    expect(marked.exercises[0].mark).toBe('pain');
    expect(marked.exercises[1].mark).toBeNull();
    expect(setDraftMark(marked, 'we1', null).exercises[0].mark).toBeNull();
  });
});

describe('isDraftDirty', () => {
  it('ignores array and object identity', () => {
    expect(isDraftDirty(draft(), draft())).toBe(false);
    expect(isDraftDirty(draft(), JSON.parse(JSON.stringify(draft())))).toBe(false);
  });

  it('sees a value, a tick, a type, a mark, an added and a removed set', () => {
    const d = draft();
    expect(isDraftDirty(d, patchDraftSet(d, 'we1', 0, { reps: 6 }))).toBe(true);
    expect(isDraftDirty(d, patchDraftSet(d, 'we1', 0, { done: false }))).toBe(true);
    expect(isDraftDirty(d, patchDraftSet(d, 'we1', 0, { setType: 'warmup' }))).toBe(true);
    expect(isDraftDirty(d, setDraftMark(d, 'we2', 'sick'))).toBe(true);
    expect(isDraftDirty(d, addDraftSet(d, 'we1', 'kg', 'km'))).toBe(true);
    expect(isDraftDirty(d, removeDraftSet(d, 'we1', 1))).toBe(true);
  });

  it('a value changed and changed back is clean', () => {
    const d = draft();
    expect(isDraftDirty(d, patchDraftSet(patchDraftSet(d, 'we1', 0, { reps: 6 }), 'we1', 0, { reps: 5 }))).toBe(false);
  });
});

describe('draftProblems', () => {
  it('names reps for a done weighted set without reps, and time for a timed set without a time', () => {
    let d = patchDraftSet(draft(), 'we1', 1, { reps: null });
    d = patchDraftSet(d, 'we2', 0, { durationS: null });
    expect(draftProblems(d)).toEqual([
      { workoutExerciseId: 'we1', index: 1, need: 'reps' },
      { workoutExerciseId: 'we2', index: 0, need: 'time' },
    ]);
  });

  it('names the weight first when both are missing, and ignores sets that are not done', () => {
    let d = patchDraftSet(draft(), 'we1', 0, { weight: null, reps: null });
    d = patchDraftSet(d, 'we1', 1, { weight: null, done: false });
    expect(draftProblems(d)).toEqual([{ workoutExerciseId: 'we1', index: 0, need: 'weight' }]);
  });

  it('a bodyweight plus set needs only reps, distance and time needs the distance', () => {
    const d: WorkoutDraft = {
      workoutId: 'w',
      name: 'W',
      exercises: [
        { workoutExerciseId: 'a', exerciseId: 'dip', name: 'Dip', loggingType: 'bodyweight_plus', showRpe: false, mark: null, sets: [set({ weight: null, weightUnit: null })] },
        { workoutExerciseId: 'b', exerciseId: 'run', name: 'Run', loggingType: 'distance_time', showRpe: false, mark: null, sets: [set({ weight: null, reps: null, durationS: 600, distance: null })] },
      ],
    };
    expect(draftProblems(d)).toEqual([{ workoutExerciseId: 'b', index: 0, need: 'distance' }]);
  });

  it('is empty for a clean draft', () => {
    expect(draftProblems(draft())).toEqual([]);
  });
});

describe('draftLeavesNothing', () => {
  it('is true only when no set anywhere is done', () => {
    const d = draft();
    expect(draftLeavesNothing(d)).toBe(false);
    let none = patchDraftSet(d, 'we1', 0, { done: false });
    none = patchDraftSet(none, 'we1', 1, { done: false });
    expect(draftLeavesNothing(none)).toBe(false);
    none = patchDraftSet(none, 'we2', 0, { done: false });
    expect(draftLeavesNothing(none)).toBe(true);
  });
});
