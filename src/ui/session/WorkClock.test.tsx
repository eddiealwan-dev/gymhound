import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { LEAD_IN_MS, pauseTimer, releaseHold, startTimer, stopTimer, type WorkPlan, type WorkTimer } from '../../domain/workClock';
import { doneWorkClock, pauseWorkClock, releaseWorkHold, resetWorkClock, resumeWorkClock, startWorkClock } from '../../state/workClockActions';
import { Button } from '../Button';
import { WorkClock } from './WorkClock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/workClockActions', () => ({
  startWorkClock: jest.fn(),
  pauseWorkClock: jest.fn(),
  resumeWorkClock: jest.fn(),
  doneWorkClock: jest.fn(),
  resetWorkClock: jest.fn(),
  releaseWorkHold: jest.fn(),
}));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const T0 = new Date(2026, 9, 15, 9, 0).getTime();
const amrap10: WorkPlan = { kind: 'amrap', noun: 'AMRAP', steps: [{ kind: 'work', seconds: 600, set: 1 }] };
const fran: WorkPlan = { kind: 'for_time', noun: 'For Time', steps: [{ kind: 'work', seconds: 480, set: 1 }] };
const noEasy: WorkPlan = {
  kind: 'intervals',
  noun: 'Intervals',
  steps: [
    { kind: 'work', seconds: 60, set: 1, holdAfter: true },
    { kind: 'work', seconds: 60, set: 2 },
  ],
};
const started = (plan: WorkPlan, at = T0): WorkTimer => startTimer({ workoutId: 'w1', workoutExerciseId: 'we1', plan }, at);

let tree: ReactTestRenderer;

function mount(plan: WorkPlan, timer: WorkTimer | null, busy = false) {
  act(() => {
    tree = create(<WorkClock workoutId="w1" workoutExerciseId="we1" plan={plan} timer={timer} busy={busy} />);
  });
}

function rerender(plan: WorkPlan, timer: WorkTimer | null) {
  act(() => tree.update(<WorkClock workoutId="w1" workoutExerciseId="we1" plan={plan} timer={timer} busy={false} />));
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(T0);
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const shownText = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const pills = () => tree.root.findAllByType(Button).map((b) => b.props.accessibilityLabel ?? b.props.label);
const pill = (label: string) => tree.root.findAllByType(Button).find((b) => (b.props.accessibilityLabel ?? b.props.label) === label)!;
const timeBox = () => tree.root.find((n) => n.type === View && n.props.accessibilityRole === 'timer');
const styleOf = (node: ReactTestInstance) => [node.props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});
const track = () => tree.root.find((n) => n.type === View && n.props.accessibilityElementsHidden === true);

describe('the work clock before Start', () => {
  it('shows the full time over its name, in the rest row\'s type, with Start as its one filled pill', () => {
    mount(amrap10, null);
    expect(shownText()).toEqual(expect.arrayContaining(['AMRAP', '10:00']));
    const time = tree.root.find((n) => n.type === Text && n.props.children === '10:00');
    expect(styleOf(time)).toMatchObject({ fontSize: 32, fontFamily: 'BarlowCondensed_800ExtraBold' });
    expect(pills()).toEqual(['Start the AMRAP']);
    expect(pill('Start the AMRAP').props.variant).toBe('primary');
    expect(timeBox().props.accessibilityLabel).toBe('AMRAP, 10 minutes');
    expect(styleOf(track()).width).toBe('100%');
  });

  it('starts the clock from the stored start: Start writes it, nothing ticks here', () => {
    mount(amrap10, null);
    act(() => pill('Start the AMRAP').props.onPress());
    expect(startWorkClock).toHaveBeenCalledWith('db', 'w1', 'we1', amrap10);
  });

  it('dims Start while another clock is going', () => {
    mount(amrap10, null, true);
    expect(pill('Start the AMRAP').props.disabled).toBe(true);
  });

  it('shows For Time at 0:00 beside its cap', () => {
    mount(fran, null);
    expect(shownText()).toEqual(expect.arrayContaining(['FOR TIME', '0:00', '/ 8:00']));
    expect(styleOf(track()).width).toBe('0%');
  });
});

describe('the work clock running (wall clock)', () => {
  it('counts the lead-in, then the AMRAP down, on each whole second', () => {
    mount(amrap10, started(amrap10));
    expect(shownText()).toEqual(expect.arrayContaining(['GET READY', '0:10']));
    expect(pills()).toEqual(['Pause the timer', 'Reset the timer']);
    advance(LEAD_IN_MS);
    expect(shownText()).toEqual(expect.arrayContaining(['AMRAP', '10:00']));
    expect(pills()).toEqual(['Pause the timer', 'Stop the clock']);
    advance(1_000);
    expect(shownText()).toContain('9:59');
    advance(59_000);
    expect(shownText()).toContain('9:00');
    expect(timeBox().props.accessibilityLabel).toBe('AMRAP, 9 minutes left');
  });

  it('survives a lock: drawn again later, it reads the time from the stored start', () => {
    const timer = started(amrap10);
    jest.setSystemTime(T0 + LEAD_IN_MS + 4 * 60_000 + 30_000);
    mount(amrap10, timer);
    expect(shownText()).toContain('5:30');
  });

  it('holds still while paused, with Resume filled, Done and Reset', () => {
    const paused = pauseTimer(started(amrap10), T0 + LEAD_IN_MS + 60_000);
    jest.setSystemTime(T0 + LEAD_IN_MS + 90_000);
    mount(amrap10, paused);
    expect(shownText()).toContain('9:00');
    expect(pills()).toEqual(['Resume the timer', 'Stop the clock', 'Reset the timer']);
    expect(pill('Resume the timer').props.variant).toBe('primary');
    advance(30_000);
    expect(shownText()).toContain('9:00');
    expect(timeBox().props.accessibilityLabel).toBe('AMRAP, 9 minutes left, paused');
  });

  it('sends each pill to its action', () => {
    mount(amrap10, pauseTimer(started(amrap10), T0 + LEAD_IN_MS + 1_000));
    act(() => pill('Resume the timer').props.onPress());
    act(() => pill('Stop the clock').props.onPress());
    act(() => pill('Reset the timer').props.onPress());
    expect(resumeWorkClock).toHaveBeenCalledWith('db');
    expect(doneWorkClock).toHaveBeenCalledWith('db');
    expect(resetWorkClock).toHaveBeenCalledWith('db');
    rerender(amrap10, started(amrap10));
    act(() => pill('Pause the timer').props.onPress());
    expect(pauseWorkClock).toHaveBeenCalledWith('db');
  });

  it('counts For Time up beside its cap, and holds the cap line once it is reached', () => {
    mount(fran, started(fran));
    advance(LEAD_IN_MS + 185_000);
    expect(shownText()).toEqual(expect.arrayContaining(['3:05', '/ 8:00']));
    advance(300_000);
    expect(shownText()).toContain('Cap reached. 8:00 is your time.');
    expect(pills()).toEqual([]);
  });

  it('holds where Done stopped it, with what to do next', () => {
    mount(fran, stopTimer(started(fran), T0 + LEAD_IN_MS + 462_000));
    expect(shownText()).toContain('Stopped at 7:42. Tick to log it.');
    expect(pills()).toEqual([]);
  });

  it('waits between intervals with no easy part until Start', () => {
    const t = started(noEasy);
    jest.setSystemTime(T0 + LEAD_IN_MS + 75_000);
    mount(noEasy, t);
    expect(shownText()).toEqual(expect.arrayContaining(['HARD · 2 OF 2', '1:00']));
    expect(pills()).toEqual(['Start set 2', 'Stop the clock']);
    act(() => pill('Start set 2').props.onPress());
    expect(releaseWorkHold).toHaveBeenCalledWith('db');
    rerender(noEasy, releaseHold(t, Date.now()));
    advance(1_000);
    expect(shownText()).toContain('0:59');
  });
});
