import { REST_BY_KIND, restKindOf, restLengthOf, TIMED_RUN_IDS, type RestKindInput } from './restKind';

/** A program slot as the session knows it: a dumbbell isolation move unless a test says otherwise. */
const slot = (extra: Partial<RestKindInput> = {}): RestKindInput => ({
  exerciseId: 'dumbbell-lateral-raise',
  ruleKind: 'load',
  loggingType: 'weighted',
  isMain: false,
  firstOfDay: false,
  equipment: 'dumbbell',
  pattern: 'isolation',
  ...extra,
});

describe('restKindOf (R639)', () => {
  it('gives no rest after a metcon, by its rule kind or its score type', () => {
    expect(restKindOf(slot({ exerciseId: 'metcon-amrap-12-wallball-t2b-row', ruleKind: 'metcon', loggingType: 'rounds' }))).toBe('none');
    expect(restKindOf(slot({ ruleKind: 'load', loggingType: 'for_time' }))).toBe('none');
    expect(restKindOf(slot({ ruleKind: 'load', loggingType: 'rounds' }))).toBe('none');
  });

  it('gives no rest after any run, by exercise id, whatever its rule kind (bike and rower intervals add sets)', () => {
    for (const id of TIMED_RUN_IDS) {
      expect(restKindOf(slot({ exerciseId: id, ruleKind: 'add_set', loggingType: 'timed', isMain: true }))).toBe('none');
    }
    expect(restKindOf(slot({ exerciseId: 'easy-run', ruleKind: 'weekly_seconds', loggingType: 'timed' }))).toBe('none');
    expect([...TIMED_RUN_IDS].sort()).toEqual(
      ['bike-intervals', 'easy-run', 'incline-treadmill-walk', 'interval-run', 'long-run', 'rower-intervals', 'tempo-run'],
    );
  });

  it('calls the main slot, the first slot of the day and a barbell compound heavy', () => {
    expect(restKindOf(slot({ isMain: true }))).toBe('heavy');
    expect(restKindOf(slot({ firstOfDay: true }))).toBe('heavy');
    expect(restKindOf(slot({ equipment: 'barbell', pattern: 'horizontal_push' }))).toBe('heavy');
  });

  it('calls an event heavy: carries, yoke and sled', () => {
    expect(restKindOf(slot({ exerciseId: 'yoke-carry', loggingType: 'weighted_distance', equipment: 'other', pattern: 'carry' }))).toBe('heavy');
    expect(restKindOf(slot({ exerciseId: 'sled-push-distance', loggingType: 'weighted_distance', equipment: 'other', pattern: 'squat' }))).toBe('heavy');
  });

  it('calls any other multi-joint move a compound', () => {
    expect(restKindOf(slot({ equipment: 'bodyweight', pattern: 'vertical_pull' }))).toBe('compound');
    expect(restKindOf(slot({ equipment: 'dumbbell', pattern: 'hinge' }))).toBe('compound');
  });

  it('calls isolation and core moves isolation, a barbell curl too', () => {
    expect(restKindOf(slot())).toBe('isolation');
    expect(restKindOf(slot({ equipment: 'bodyweight', pattern: 'core', ruleKind: 'hold', loggingType: 'timed', exerciseId: 'plank' }))).toBe('isolation');
    expect(restKindOf(slot({ equipment: 'barbell', pattern: 'isolation' }))).toBe('isolation');
  });

  it('rests 150, 105 and 75 s by kind, and none after a metcon or a run', () => {
    expect(REST_BY_KIND).toEqual({ heavy: 150, compound: 105, isolation: 75, none: 0 });
  });
});

describe('restLengthOf (R639)', () => {
  it("keeps today's behaviour for your own routines: the exercise's own rest, else the rest in Settings", () => {
    expect(restLengthOf({ restSeconds: null, program: null }, 120)).toBe(120);
    expect(restLengthOf({ restSeconds: 45, program: null }, 120)).toBe(45);
    expect(restLengthOf({ restSeconds: 0 }, 120)).toBe(0);
    expect(restLengthOf({ restSeconds: null }, 90)).toBe(90);
  });

  it("follows a program slot's kind unless the lifter set their own rest, which wins", () => {
    expect(restLengthOf({ restSeconds: null, program: { restKind: 'heavy' } }, 120)).toBe(150);
    expect(restLengthOf({ restSeconds: null, program: { restKind: 'compound' } }, 120)).toBe(105);
    expect(restLengthOf({ restSeconds: null, program: { restKind: 'isolation' } }, 120)).toBe(75);
    expect(restLengthOf({ restSeconds: 200, program: { restKind: 'heavy' } }, 120)).toBe(200);
    expect(restLengthOf({ restSeconds: 0, program: { restKind: 'heavy' } }, 120)).toBe(0);
  });

  it('never rests after a metcon or a run, even with a rest of its own', () => {
    expect(restLengthOf({ restSeconds: null, program: { restKind: 'none' } }, 120)).toBe(0);
    expect(restLengthOf({ restSeconds: 90, program: { restKind: 'none' } }, 120)).toBe(0);
  });
});
