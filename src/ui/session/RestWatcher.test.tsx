import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { BellSound } from '../../domain/types';
import { RestWatcher } from './RestWatcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// What the screen would read from the database. A test changes it, as a bump after a write would, and the next tick sees it.
const mockState: { rest: { workoutId: string; restEndsAt: number | null } | null; bell: boolean; sound: BellSound } = {
  rest: null,
  bell: true,
  sound: 'chime',
};
const mockCalls: string[] = [];

jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: () => mockState }));
jest.mock('../../state/sessionActions', () => ({
  restEnded: jest.fn((db: string, workoutId: string) => {
    mockCalls.push(`restEnded ${db} ${workoutId}`);
    // The write clears the stored end, and the version bump makes the screen read it again.
    if (mockState.rest) mockState.rest = { ...mockState.rest, restEndsAt: null };
  }),
}));
jest.mock('../../platform/restTimer/bell', () => ({
  playBell: jest.fn((sound: string) => {
    mockCalls.push(`bell ${sound}`);
    return Promise.resolve();
  }),
}));
jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: jest.fn((type: string) => {
    mockCalls.push(`haptic ${type}`);
    return Promise.resolve();
  }),
}));

const NOW = 1_000_000_000_000;

function mount() {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<RestWatcher />);
  });
  return tree;
}

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  mockCalls.length = 0;
  mockState.rest = { workoutId: 'w1', restEndsAt: null };
  mockState.bell = true;
  mockState.sound = 'chime';
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('RestWatcher: the rest ends with a haptic and a bell wherever the user is (R30)', () => {
  it('draws nothing', () => {
    const tree = mount();
    expect(tree.toJSON()).toBeNull();
  });

  it('does not tick while no rest is running', () => {
    mockState.rest = null;
    mount();
    expect(jest.getTimerCount()).toBe(0);

    mockState.rest = { workoutId: 'w1', restEndsAt: null };
    const tree = mount();
    expect(jest.getTimerCount()).toBe(0);
    act(() => tree.unmount());
  });

  it('buzzes, then rings the chosen bell, then clears the rest, once, when a rest it watched runs out', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 2_000 };
    mount();

    advance(1_000);
    expect(mockCalls).toEqual([]);

    advance(1_500);
    expect(mockCalls).toEqual(['haptic success', 'bell chime', 'restEnded db w1']);

    // Time carries on, and the rest is gone: nothing more happens, and the clock stops.
    advance(5_000);
    expect(mockCalls).toHaveLength(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rings once even if the cleared rest is not read back yet', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
    const restEnded = jest.requireMock('../../state/sessionActions').restEnded as jest.Mock;
    restEnded.mockImplementation((db: string, workoutId: string) => {
      mockCalls.push(`restEnded ${db} ${workoutId}`);
    });
    mount();

    advance(2_000);
    advance(2_000);

    expect(mockCalls).toEqual(['haptic success', 'bell chime', 'restEnded db w1']);
  });

  it('still buzzes and clears when the bell is off, but does not ring', () => {
    mockState.bell = false;
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
    mount();

    advance(1_500);

    expect(mockCalls).toEqual(['haptic success', 'restEnded db w1']);
  });

  it('rings the sound that is chosen', () => {
    mockState.sound = 'ding';
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
    mount();

    advance(1_500);

    expect(mockCalls).toContain('bell ding');
  });

  it('follows the end time when it moves: a later tick pushes the end out, so no ring at the old end', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 2_000 };
    mount();
    advance(500);
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 10_000 };

    advance(3_000);
    expect(mockCalls).toEqual([]);

    advance(7_000);
    expect(mockCalls).toEqual(['haptic success', 'bell chime', 'restEnded db w1']);
  });

  it('opened on a rest that already ran out, clears it quietly: no haptic, no bell', () => {
    // The app was closed over the end, so the notification already rang.
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW - 30_000 };
    mount();

    advance(500);

    expect(mockCalls).toEqual(['restEnded db w1']);
  });

  it('does not ring late: after the phone was away past the window it clears quietly', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
    mount();
    advance(1_000);

    // Backgrounded: no ticks, and the clock jumps well past the end before the next one.
    jest.setSystemTime(NOW + 60_000);
    advance(250);

    expect(mockCalls).toEqual(['restEnded db w1']);
  });

  it('has no haptic on web, and still rings', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
    mount();

    advance(1_500);

    expect(mockCalls).toEqual(['bell chime', 'restEnded db w1']);
  });

  it('stops watching when it unmounts', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
    const tree = mount();
    expect(jest.getTimerCount()).toBe(1);

    act(() => tree.unmount());

    expect(jest.getTimerCount()).toBe(0);
  });
});
