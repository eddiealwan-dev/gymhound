import { exerciseProgress, workoutProgress } from './sessionProgress';

describe('workoutProgress: every set of the workout, warmups included', () => {
  it('counts the done sets and all the sets', () => {
    expect(workoutProgress([{ sets: [{ done: true }, { done: true }, { done: false }] }, { sets: [{ done: false }] }])).toEqual({
      done: 2,
      total: 4,
    });
  });

  it('is 0 of 0 with no exercises', () => {
    expect(workoutProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('exerciseProgress: the sets of one exercise', () => {
  it('counts the done sets and all the sets', () => {
    expect(exerciseProgress({ sets: [{ done: true }, { done: false }] })).toEqual({ done: 1, total: 2 });
  });
});
