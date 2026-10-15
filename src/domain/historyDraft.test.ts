import {
  addDraftSet,
  changedExercises,
  draftValuesInRange,
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

describe('changedExercises', () => {
  it('names only the exercises whose sets or mark changed', () => {
    const d = draft();
    expect(changedExercises(d, JSON.parse(JSON.stringify(d)))).toEqual([]);
    expect(changedExercises(d, patchDraftSet(d, 'we2', 0, { durationS: 70 }))).toEqual(['we2']);
    expect(changedExercises(d, setDraftMark(d, 'we1', 'pain'))).toEqual(['we1']);
    expect(changedExercises(d, removeDraftSet(addDraftSet(d, 'we1', 'lb', 'mi'), 'we2', 0))).toEqual(['we1', 'we2']);
  });
});

describe('draftValuesInRange', () => {
  it('accepts stored values and rejects negatives, non-finite numbers and an RPE outside 6 to 10', () => {
    const d = draft();
    expect(draftValuesInRange(d)).toBe(true);
    expect(draftValuesInRange(patchDraftSet(d, 'we1', 0, { rpe: 6, weight: 0 }))).toBe(true);
    expect(draftValuesInRange(patchDraftSet(d, 'we1', 0, { rpe: 10 }))).toBe(true);
    expect(draftValuesInRange(patchDraftSet(d, 'we1', 0, { rpe: 5.5 }))).toBe(false);
    expect(draftValuesInRange(patchDraftSet(d, 'we1', 0, { rpe: 11 }))).toBe(false);
    expect(draftValuesInRange(patchDraftSet(d, 'we1', 0, { weight: -1 }))).toBe(false);
    expect(draftValuesInRange(patchDraftSet(d, 'we1', 0, { reps: Number.NaN }))).toBe(false);
    expect(draftValuesInRange(patchDraftSet(d, 'we2', 0, { durationS: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(draftValuesInRange(patchDraftSet(d, 'we2', 0, { distance: -0.5 }))).toBe(false);
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

describe('the three program logging types (R607)', () => {
  const program = (): WorkoutDraft => ({
    workoutId: 'w2',
    name: 'Strongman',
    exercises: [
      {
        workoutExerciseId: 'yoke',
        exerciseId: 'yoke-carry',
        name: 'Yoke carry',
        loggingType: 'weighted_distance',
        showRpe: false,
        mark: null,
        sets: [set({ id: 'y1', weight: 315, weightUnit: 'lb', reps: null, distance: 50, distanceUnit: 'ft' })],
      },
      {
        workoutExerciseId: 'amrap',
        exerciseId: 'metcon-amrap-10-squat-pushup-run',
        name: 'AMRAP 10',
        loggingType: 'rounds',
        showRpe: false,
        mark: null,
        sets: [set({ id: 'a1', weight: null, weightUnit: null, reps: 6, extraReps: 4 })],
      },
      {
        workoutExerciseId: 'fran',
        exerciseId: 'metcon-21-15-9-thruster-pullup',
        name: '21-15-9',
        loggingType: 'for_time',
        showRpe: false,
        mark: null,
        sets: [set({ id: 'f1', weight: null, weightUnit: null, reps: null, durationS: 462 })],
      },
    ],
  });

  it("a carry needs its weight and distance, not its time; a score its rounds or its time", () => {
    expect(draftProblems(program())).toEqual([]);
    let d = patchDraftSet(program(), 'yoke', 0, { distance: null });
    d = patchDraftSet(d, 'amrap', 0, { reps: null });
    d = patchDraftSet(d, 'fran', 0, { durationS: null });
    expect(draftProblems(d)).toEqual([
      { workoutExerciseId: 'yoke', index: 0, need: 'distance' },
      { workoutExerciseId: 'amrap', index: 0, need: 'reps' },
      { workoutExerciseId: 'fran', index: 0, need: 'time' },
    ]);
  });

  it('a change to the extra reps is a change to save', () => {
    const saved = program();
    const changed = patchDraftSet(saved, 'amrap', 0, { extraReps: 5 });
    expect(isDraftDirty(saved, changed)).toBe(true);
    expect(changedExercises(saved, changed)).toEqual(['amrap']);
    // A set read with no extra reps is the same as one with none.
    const noExtra = patchDraftSet(saved, 'yoke', 0, { extraReps: null });
    expect(isDraftDirty(saved, noExtra)).toBe(false);
  });

  it('extra reps below zero are out of range', () => {
    expect(draftValuesInRange(program())).toBe(true);
    expect(draftValuesInRange(patchDraftSet(program(), 'amrap', 0, { extraReps: -1 }))).toBe(false);
  });

  it("a set added to a carry takes the carry's own unit, not the distance unit in Settings", () => {
    const d = addDraftSet(program(), 'yoke', 'lb', 'mi');
    expect(d.exercises[0].sets[1]).toMatchObject({ distance: null, distanceUnit: 'ft', weightUnit: 'lb', done: false });
    const run = addDraftSet(program(), 'amrap', 'lb', 'mi');
    expect(run.exercises[1].sets[1].distanceUnit).toBe('mi');
  });

  it('a carry with no unit yet takes m', () => {
    const d = patchDraftSet(program(), 'yoke', 0, { distanceUnit: null });
    expect(addDraftSet(d, 'yoke', 'lb', 'km').exercises[0].sets[1].distanceUnit).toBe('m');
  });
});
