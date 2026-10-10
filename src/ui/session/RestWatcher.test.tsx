import { AppState, Platform, type AppStateStatus } from 'react-native';
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
  restEnded: jest.fn((db: string, workoutId: string, endsAt: number) => {
    mockCalls.push(`restEnded ${db} ${workoutId} ${endsAt}`);
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

/** The call that clears a rest which ended `ms` from the start. */
const ended = (ms: number) => `restEnded db w1 ${NOW + ms}`;

// The phone's foreground state. A test starts in the foreground and sends changes through the listeners the watcher added.
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
const removeAppStateListener = jest.fn();
const appState = (state: AppStateStatus) => act(() => appStateListeners.forEach((listener) => listener(state)));
// Jest's React Native setup makes `AppState.currentState` a mock function; the real one is a string.
const originalCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
const setCurrentState = (state: AppStateStatus) =>
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  appStateListeners = [];
  removeAppStateListener.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: AppStateStatus) => void) => {
    appStateListeners.push(listener);
    return { remove: removeAppStateListener };
  }) as unknown as typeof AppState.addEventListener);
  setCurrentState('active');
  mockCalls.length = 0;
  mockState.rest = { workoutId: 'w1', restEndsAt: null };
  mockState.bell = true;
  mockState.sound = 'chime';
});

afterEach(() => {
  if (originalCurrentState) Object.defineProperty(AppState, 'currentState', originalCurrentState);
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
    expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(2_000)]);

    // Time carries on, and the rest is gone: nothing more happens, and the clock stops.
    advance(5_000);
    expect(mockCalls).toHaveLength(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rings once even if the cleared rest is not read back yet', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
    const restEnded = jest.requireMock('../../state/sessionActions').restEnded as jest.Mock;
    restEnded.mockImplementation((db: string, workoutId: string, endsAt: number) => {
      mockCalls.push(`restEnded ${db} ${workoutId} ${endsAt}`);
    });
    mount();

    advance(2_000);
    advance(2_000);

    expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(1_000)]);
  });

  it('still buzzes and clears when the bell is off, but does not ring', () => {
    mockState.bell = false;
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
    mount();

    advance(1_500);

    expect(mockCalls).toEqual(['haptic success', ended(1_000)]);
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
    expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(10_000)]);
  });

  it('opened on a rest that already ran out, clears it quietly: no haptic, no bell', () => {
    // The app was closed over the end, so the notification already rang.
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW - 30_000 };
    mount();

    advance(500);

    expect(mockCalls).toEqual([ended(-30_000)]);
  });

  it('does not ring late: after the phone was away past the window it clears quietly', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
    mount();
    advance(1_000);

    // Backgrounded: no ticks, and the clock jumps well past the end before the next one.
    jest.setSystemTime(NOW + 60_000);
    advance(250);

    expect(mockCalls).toEqual([ended(5_000)]);
  });

  it('has no haptic on web, and still rings', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
    mount();

    advance(1_500);

    expect(mockCalls).toEqual(['bell chime', ended(1_000)]);
  });

  describe('when the app was away as the rest ended (R31): the notification already rang, so there is no second ring', () => {
    it('does not ring on return after the app was backgrounded through the end, but clears the rest', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(1_000);

      appState('background');
      jest.setSystemTime(NOW + 6_000); // away over the end, back one second after it
      appState('active');
      advance(250);

      expect(mockCalls).toEqual([ended(5_000)]);
    });

    it('does not ring if the clock fires in the background right at the end (iOS runs timers for a moment after leaving)', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(1_000);

      appState('background');
      advance(5_000);

      expect(mockCalls).toEqual([ended(5_000)]);
    });

    it('does not ring when the app went inactive, then to the background, before the end (the phone locks)', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(1_000);

      appState('inactive');
      appState('background');
      advance(5_000);

      expect(mockCalls).toEqual([ended(5_000)]);
    });

    // Control Center, Notification Center and the app switcher make the app inactive while it is still in front. The
    // foreground notification handler is silent, so nothing else rings: the watcher must.
    it('still rings when the app is only inactive through the end (Control Center, Notification Center)', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(1_000);

      appState('inactive');
      advance(5_000);

      expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(5_000)]);
    });

    it('still rings when the app is inactive, then active again, before the end', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(1_000);
      appState('inactive');
      advance(1_000);
      appState('active');

      advance(3_500);

      expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(5_000)]);
    });

    it('opened while inactive does not count as away', () => {
      setCurrentState('inactive');
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 2_000 };
      mount();

      advance(2_500);

      expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(2_000)]);
    });

    it('returning from the background through inactive ends the away span only when the app is active', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(1_000);

      appState('background');
      jest.setSystemTime(NOW + 5_500); // the end passed while away
      appState('inactive'); // coming back: still not in front
      appState('active');
      advance(250);

      expect(mockCalls).toEqual([ended(5_000)]);
    });

    it('starting in the background counts as away', () => {
      setCurrentState('background');
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 2_000 };
      mount();

      advance(2_500);

      expect(mockCalls).toEqual([ended(2_000)]);
    });

    it('still rings when the app left and came back before the end', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(500);
      appState('background');
      advance(500);
      appState('active');

      advance(4_500);

      expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(5_000)]);
    });

    it('still rings when the app went away after the end', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 1_000 };
      mount();
      advance(1_250);
      appState('background');

      expect(mockCalls).toEqual(['haptic success', 'bell chime', ended(1_000)]);
    });

    it('does not apply on web, where there is no notification to have rung', () => {
      jest.replaceProperty(Platform, 'OS', 'web');
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      mount();
      advance(1_000);

      appState('background');
      jest.setSystemTime(NOW + 6_000);
      appState('active');
      advance(250);

      expect(appStateListeners).toHaveLength(0);
      expect(mockCalls).toEqual(['bell chime', ended(5_000)]);
    });

    it('stops listening when it unmounts', () => {
      mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
      const tree = mount();
      expect(appStateListeners).toHaveLength(1);

      act(() => tree.unmount());

      expect(removeAppStateListener).toHaveBeenCalledTimes(1);
    });
  });

  it('stops watching when it unmounts', () => {
    mockState.rest = { workoutId: 'w1', restEndsAt: NOW + 5_000 };
    const tree = mount();
    expect(jest.getTimerCount()).toBe(1);

    act(() => tree.unmount());

    expect(jest.getTimerCount()).toBe(0);
  });
});
