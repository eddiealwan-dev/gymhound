import { act, create } from 'react-test-renderer';
import type { BellSound } from '../../domain/types';
import { LEAD_IN_MS, pauseTimer, startTimer, type WorkPlan, type WorkTimer } from '../../domain/workClock';
import { WorkClockWatcher } from './WorkClockWatcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// What the watcher reads from the database. A write changes it, as the bump after a write would.
const mockState: { timer: WorkTimer | null; workoutId: string | null; bell: boolean; sound: BellSound; volume: number } = {
  timer: null,
  workoutId: 'w1',
  bell: true,
  sound: 'chime',
  volume: 1,
};
const mockCalls: string[] = [];

jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: () => mockState }));
jest.mock('../../state/workClockActions', () => ({
  workCueDealtWith: jest.fn((_db: string, index: number, kind: string) => {
    mockCalls.push(`dealt ${index} ${kind}`);
    if (mockState.timer) mockState.timer = { ...mockState.timer, rang: Math.max(mockState.timer.rang, index) };
  }),
}));
jest.mock('../../platform/restTimer/bell', () => ({
  playBell: jest.fn((sound: string, volume: number) => {
    mockCalls.push(`bell ${sound} ${volume}`);
    return Promise.resolve();
  }),
}));
const mockAnnounce = jest.fn((_text: string) => {});
jest.mock('../../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));
jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: jest.fn((type: string) => {
    mockCalls.push(`haptic ${type}`);
    return Promise.resolve();
  }),
}));

const T0 = 1_000_000_000_000;
const amrap2: WorkPlan = { kind: 'amrap', noun: 'AMRAP', steps: [{ kind: 'work', seconds: 120, set: 1 }] };
const started = (plan: WorkPlan, at = T0): WorkTimer => startTimer({ workoutId: 'w1', workoutExerciseId: 'we1', plan }, at);

let tree: ReturnType<typeof create>;
function mount() {
  act(() => {
    tree = create(<WorkClockWatcher />);
  });
}
const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(T0);
  mockCalls.length = 0;
  mockAnnounce.mockClear();
  mockState.timer = null;
  mockState.workoutId = 'w1';
  mockState.bell = true;
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe('the work clock rings its cues wherever the lifter is (Task 7b)', () => {
  it('rings the go, a minute left (said only) and the end, each once', () => {
    mockState.timer = started(amrap2);
    mount();
    advance(LEAD_IN_MS - 500);
    expect(mockCalls).toEqual([]);
    advance(1_000);
    expect(mockCalls).toEqual(['haptic success', 'bell chime 1', 'dealt 1 go']);
    expect(mockAnnounce).toHaveBeenLastCalledWith('Go. AMRAP, 2 minutes.');
    advance(60_000);
    expect(mockCalls.slice(3)).toEqual(['dealt 2 warn']);
    expect(mockAnnounce).toHaveBeenLastCalledWith('1 minute left.');
    advance(60_000);
    expect(mockCalls.slice(4)).toEqual(['haptic success', 'bell chime 1', 'dealt 3 end']);
    expect(mockAnnounce).toHaveBeenLastCalledWith('Time. Enter your rounds.');
    advance(10_000);
    expect(mockCalls).toHaveLength(7);
  });

  it('stops reading the clock once the end has rung: an ended clock has nothing left to ring', () => {
    mockState.timer = started(amrap2);
    mount();
    advance(LEAD_IN_MS + 1_000);
    expect(jest.getTimerCount()).toBe(1);
    advance(120_000);
    expect(mockCalls).toContain('dealt 3 end');
    advance(1_000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('only catches up on a cue long past (the lock-screen notification rang it), and never rings it late', () => {
    mockState.timer = started(amrap2);
    jest.setSystemTime(T0 + LEAD_IN_MS + 30_000);
    mount();
    advance(300);
    expect(mockCalls).toEqual(['dealt 1 go']);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it('keeps the bell off when Settings has it off, and still buzzes and says it', () => {
    mockState.bell = false;
    mockState.timer = started(amrap2);
    mount();
    advance(LEAD_IN_MS + 300);
    expect(mockCalls).toEqual(['haptic success', 'dealt 1 go']);
    expect(mockAnnounce).toHaveBeenCalledWith('Go. AMRAP, 2 minutes.');
  });

  it('rings nothing while paused, or for a clock of a workout no longer running', () => {
    mockState.timer = pauseTimer(started(amrap2), T0 + 1_000);
    mount();
    advance(LEAD_IN_MS * 3);
    expect(mockCalls).toEqual([]);
    act(() => tree.unmount());
    mockState.timer = started(amrap2);
    mockState.workoutId = null;
    mount();
    advance(LEAD_IN_MS * 3);
    expect(mockCalls).toEqual([]);
  });
});
