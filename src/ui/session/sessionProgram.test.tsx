import { router } from 'expo-router';
import { act, create } from 'react-test-renderer';
import Session from '../../../app/session';
import { changeRungTo, replaceWith } from '../../state/sessionActions';
import { Text } from 'react-native';
import { ConfirmSheet } from '../Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUNGS = [
  { name: 'Scapular pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
  { name: 'Arch hang', timed: true, repMin: 10, repMax: 30, weighted: false },
  { name: 'Pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
];
const ladderRule = { kind: 'ladder', rung: 0, rungs: RUNGS, sets: 3 };
const pullUps = (done: boolean) => ({
  id: 'we1',
  exerciseId: 'fedb-scapular-pull-up',
  name: 'Scapular pull-up',
  sets: [{ done }],
  supersetGroup: null,
  program: { rule: ladderRule, warmUp: true, note: null },
});
let mockWorkout: Record<string, unknown>;
/** The work clock in settings (Task 7b), or none. */
let mockWorkTimer: Record<string, unknown> | null = null;

/** What each block and the Modify sheet were last drawn with. */
const mockBlocks = new Map<string, Record<string, unknown>>();
let mockModify: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => 'Pull A') }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockWorkout, unit: 'kg', distanceUnit: 'km', restSeconds: 120, workTimer: mockWorkTimer }),
}));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn(), restPlus15: jest.fn(), replaceWith: jest.fn(), changeRungTo: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({
  ExerciseBlock: (props: { ex: { id: string } }) => {
    mockBlocks.set(props.ex.id, props);
    return null;
  },
}));
jest.mock('../ModifySheet', () => ({
  ModifySheet: (props: Record<string, unknown>) => {
    mockModify = props;
    return null;
  },
}));
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('./FoodOfferBanner', () => ({ FoodOfferBanner: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount() {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Session />);
  });
  return tree;
}

const call = (fn: unknown, ...args: unknown[]) => act(() => (fn as (...a: unknown[]) => void)(...args));
const texts = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

const programWorkout = (done = false, weekLine: string | null = null) => ({
  id: 'w1',
  name: 'Calisthenics Foundations A',
  startedAt: 1_000,
  restEndsAt: null,
  program: { name: 'Calisthenics Foundations', week: 3, weeks: 12, weekLine, done: false },
  exercises: [pullUps(done)],
});

beforeEach(() => {
  jest.useFakeTimers();
  mockBlocks.clear();
  mockModify = {};
  mockWorkTimer = null;
  jest.mocked(replaceWith).mockClear();
  jest.mocked(changeRungTo).mockClear();
  jest.mocked(router.push).mockClear();
});
afterEach(() => jest.useRealTimers());

describe('a program workout in the session (§18.29)', () => {
  it('says the week at the top, with its line', () => {
    mockWorkout = programWorkout(false, 'Deload week: half the sets, same weight. Nothing goes up or counts as a miss.');
    const tree = mount();
    const shown = texts(tree);
    expect(shown).toContain('Week 3 of 12');
    expect(shown).toContain('Deload week: half the sets, same weight. Nothing goes up or counts as a miss.');
    const group = tree.root.findAll((n) => n.props.accessibilityLabel === 'Week 3 of 12. Deload week: half the sets, same weight. Nothing goes up or counts as a miss.');
    expect(group.length).toBeGreaterThan(0);
  });

  it('after the last week it says the block is done (R616)', () => {
    mockWorkout = { ...programWorkout(), program: { name: 'Calisthenics Foundations', week: 13, weeks: 12, weekLine: null, done: true } };
    expect(texts(mount())).toContain('12 weeks done.');
    // An early deload ends the block before the last week (R627): done, as Up next says.
    mockWorkout = { ...programWorkout(), program: { name: 'Advanced Upper/Lower DUP', week: 2, weeks: 6, weekLine: null, done: true } };
    const shown = texts(mount());
    expect(shown).toContain('6 weeks done.');
    expect(shown).not.toContain('Week 2 of 6');
  });

  it('a normal week shows the week alone; your own routine shows none', () => {
    mockWorkout = programWorkout();
    expect(texts(mount())).toContain('Week 3 of 12');
    mockWorkout = { id: 'w1', name: 'Full body A', startedAt: 1_000, restEndsAt: null, exercises: [{ ...pullUps(false), program: null }] };
    expect(texts(mount()).filter((t) => t.startsWith('Week '))).toEqual([]);
  });

  it('Change rung on a ladder lists its rungs and moves today to the one picked (R618)', () => {
    mockWorkout = programWorkout();
    mount();
    call(mockBlocks.get('we1')!.onOpenModify);
    expect(mockModify.ladder).toEqual({ rungs: RUNGS, current: 0, sets: 3 });
    expect(mockModify.note).toBe('Changes it today and from now on. Its sets today start fresh.');
    call(mockModify.onChooseRung, 2);
    expect(changeRungTo).toHaveBeenCalledWith('db', 'we1', 2);
    expect(mockModify.target).toBeNull();
  });

  it('with completed sets it asks first', () => {
    mockWorkout = programWorkout(true);
    const tree = mount();
    call(mockBlocks.get('we1')!.onOpenModify);
    call(mockModify.onChooseRung, 2);
    expect(changeRungTo).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(1000));
    const ask = tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Change to Pull-up?')!;
    expect(ask.props).toMatchObject({ visible: true, body: 'Its completed sets will be cleared.', confirmLabel: 'Change', cancelLabel: 'Keep' });
    call(ask.props.onConfirm);
    expect(changeRungTo).toHaveBeenCalledWith('db', 'we1', 2);
  });
});

describe('the work clock (Task 7b)', () => {
  const two = () => ({ ...programWorkout(), exercises: [pullUps(false), { ...pullUps(false), id: 'we2' }] });
  const amrap = { kind: 'amrap', noun: 'AMRAP', steps: [{ kind: 'work', seconds: 600, set: 1 }] };
  const timer = (over: Record<string, unknown> = {}) => ({
    workoutId: 'w1',
    workoutExerciseId: 'we1',
    plan: amrap,
    startsAt: Date.now(),
    pausedAt: null,
    pausedMs: 0,
    released: 0,
    rang: 0,
    doneAtS: null,
    ...over,
  });

  it('gives the clock to its own block only, and dims Start on the others while it goes', () => {
    mockWorkout = two();
    mockWorkTimer = timer();
    mount();
    expect(mockBlocks.get('we1')).toMatchObject({ workTimer: mockWorkTimer, clockBusy: false });
    expect(mockBlocks.get('we2')).toMatchObject({ workTimer: null, clockBusy: true });
  });

  it('frees Start once the clock has ended, and with none', () => {
    mockWorkout = two();
    mockWorkTimer = timer({ doneAtS: 300 });
    mount();
    expect(mockBlocks.get('we2')).toMatchObject({ workTimer: null, clockBusy: false });
    mockWorkTimer = null;
    mount();
    expect(mockBlocks.get('we1')).toMatchObject({ workTimer: null, clockBusy: false });
  });
});
