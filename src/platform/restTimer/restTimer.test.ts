import { Platform } from 'react-native';

// expo-notifications is native. These tests drive the module against a stand-in and read the calls it makes.
const mockNotifications = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 6 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
};
jest.mock('expo-notifications', () => mockNotifications);

const NOW = 1_000_000_000_000;
const ENDS_AT = NOW + 120_000;

type Permission = { status: 'granted' | 'denied' | 'undetermined'; granted: boolean; canAskAgain: boolean };
const GRANTED: Permission = { status: 'granted', granted: true, canAskAgain: true };
const DENIED: Permission = { status: 'denied', granted: false, canAskAgain: false };
const UNDETERMINED: Permission = { status: 'undetermined', granted: false, canAskAgain: true };

/**
 * Loads a fresh copy of the module, so its load-time work (the handler, the Android channel) can be seen. `os` is the
 * platform it loads on; the isolated registry has its own react-native, so that is set on the copy the module reads.
 */
function load(os: 'ios' | 'android' = 'ios'): typeof import('./expoGoNotification').expoGoNotification {
  let surface!: typeof import('./expoGoNotification').expoGoNotification;
  jest.isolateModules(() => {
    jest.replaceProperty((require('react-native') as { Platform: typeof Platform }).Platform, 'OS', os);
    surface = (require('./expoGoNotification') as typeof import('./expoGoNotification')).expoGoNotification;
  });
  return surface;
}

/** Lets pending promise callbacks run (fake timers do not). */
async function microtasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  Object.values(mockNotifications).forEach((fn) => typeof fn === 'function' && fn.mockReset());
  mockNotifications.getPermissionsAsync.mockResolvedValue(GRANTED);
  mockNotifications.requestPermissionsAsync.mockResolvedValue(GRANTED);
  mockNotifications.scheduleNotificationAsync.mockResolvedValue('gymhound-rest');
  mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  mockNotifications.setNotificationChannelAsync.mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('expoGoNotification (Task 15 Step 5)', () => {
  it('registers a handler at load that shows nothing while the app is open', async () => {
    load();

    expect(mockNotifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    const { handleNotification } = mockNotifications.setNotificationHandler.mock.calls[0][0];
    await expect(handleNotification()).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  describe('start', () => {
    it("schedules \"Rest's up.\" for the end time, with the phone's sound when asked", async () => {
      const surface = load();

      await surface.start(ENDS_AT, true);

      expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        identifier: 'gymhound-rest',
        content: { title: "Rest's up.", sound: true },
        trigger: { type: 'date', date: ENDS_AT },
      });
    });

    it('schedules it silent when the bell is off', async () => {
      const surface = load();

      await surface.start(ENDS_AT, false);

      expect(mockNotifications.scheduleNotificationAsync.mock.calls[0][0].content).toEqual({ title: "Rest's up.", sound: false });
    });

    it('does not ask when permission is already granted', async () => {
      const surface = load();

      await surface.start(ENDS_AT, true);

      expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('asks the first time, when undetermined and it can ask, then schedules if allowed', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(UNDETERMINED);
      const surface = load();

      await surface.start(ENDS_AT, true);

      expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the answer to the question is no', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(UNDETERMINED);
      mockNotifications.requestPermissionsAsync.mockResolvedValue(DENIED);
      const surface = load();

      await expect(surface.start(ENDS_AT, true)).resolves.toBeUndefined();

      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not ask again once it was refused, and schedules nothing', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(DENIED);
      const surface = load();

      await expect(surface.start(ENDS_AT, true)).resolves.toBeUndefined();

      expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not ask when undetermined but it cannot ask again', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ ...UNDETERMINED, canAskAgain: false });
      const surface = load();

      await surface.start(ENDS_AT, true);

      expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('clears an earlier notification first, so two ticks leave one', async () => {
      const surface = load();

      await surface.start(ENDS_AT, true);

      expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('gymhound-rest');
      const cancelled = mockNotifications.cancelScheduledNotificationAsync.mock.invocationCallOrder[0];
      const scheduled = mockNotifications.scheduleNotificationAsync.mock.invocationCallOrder[0];
      expect(cancelled).toBeLessThan(scheduled);
    });

    it('does not schedule an end that has already passed while the permission question was open', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(UNDETERMINED);
      mockNotifications.requestPermissionsAsync.mockImplementation(async () => {
        jest.setSystemTime(ENDS_AT + 1_000);
        return GRANTED;
      });
      const surface = load();

      await surface.start(ENDS_AT, true);

      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('cancels, then schedules the new end', async () => {
      const surface = load();

      await surface.update(ENDS_AT - 15_000, true);

      expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('gymhound-rest');
      expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        identifier: 'gymhound-rest',
        content: { title: "Rest's up.", sound: true },
        trigger: { type: 'date', date: ENDS_AT - 15_000 },
      });
      expect(mockNotifications.cancelScheduledNotificationAsync.mock.invocationCallOrder[0]).toBeLessThan(
        mockNotifications.scheduleNotificationAsync.mock.invocationCallOrder[0],
      );
    });
  });

  describe('cancel', () => {
    it('cancels the scheduled notification and schedules nothing', async () => {
      const surface = load();

      await surface.cancel();

      expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('gymhound-rest');
      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });
});

describe('the Android rest channels (R30, R31)', () => {
  // No `sound` on 'rest': a new channel already has the default sound, and 'default' would be looked up as a raw resource.
  const LOUD = { name: 'Rest timer', importance: 6 /* HIGH */, enableVibrate: true };
  const QUIET = { name: 'Rest timer (no sound)', importance: 6 /* HIGH */, sound: null, enableVibrate: true };
  const VIBRATION = [0, 250, 250, 250];

  it("makes 'rest' at load on Android: high importance, the default sound (none named), vibration on", () => {
    load('android');

    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith('rest', LOUD);
    expect(mockNotifications.setNotificationChannelAsync.mock.calls.find((c) => c[0] === 'rest')![1]).not.toHaveProperty('sound');
  });

  it("makes 'rest-quiet' at load on Android: high importance, no sound, vibration on", () => {
    load('android');

    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith('rest-quiet', QUIET);
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
  });

  it('is not created on iOS, and its id is not put on the trigger there', async () => {
    const surface = load('ios');

    await surface.start(ENDS_AT, true);

    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(mockNotifications.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({ type: 'date', date: ENDS_AT });
  });

  it("schedules on 'rest' when the bell is on, and on 'rest-quiet' when it is off, which keeps the vibration", async () => {
    const surface = load('android');

    await surface.start(ENDS_AT, true);
    await surface.update(ENDS_AT - 15_000, false);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenNthCalledWith(1, {
      identifier: 'gymhound-rest',
      content: { title: "Rest's up.", sound: true },
      trigger: { type: 'date', date: ENDS_AT, channelId: 'rest' },
    });
    // With sound false and no vibration pattern, expo-notifications marks the notification silent, whatever its channel.
    // The pattern keeps it from being silent, so the quiet channel's vibration still comes.
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenNthCalledWith(2, {
      identifier: 'gymhound-rest',
      content: { title: "Rest's up.", sound: false, vibrate: VIBRATION },
      trigger: { type: 'date', date: ENDS_AT - 15_000, channelId: 'rest-quiet' },
    });
  });

  it('is silent with no vibration pattern and no channel on iOS when the bell is off (Expo Go cannot vibrate a silent notification there)', async () => {
    const surface = load('ios');

    await surface.start(ENDS_AT, false);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'gymhound-rest',
      content: { title: "Rest's up.", sound: false },
      trigger: { type: 'date', date: ENDS_AT },
    });
  });

  it('is made before a notification is scheduled on it', async () => {
    let created!: () => void;
    mockNotifications.setNotificationChannelAsync.mockReturnValue(new Promise((resolve) => (created = () => resolve({}))));
    const surface = load('android');

    const started = surface.start(ENDS_AT, true);
    await microtasks();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    created();
    await started;
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('is logged when a channel cannot be made, the other is still made, and the rest notification is still scheduled', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNotifications.setNotificationChannelAsync.mockImplementation(async (id: string) => {
      if (id === 'rest') throw new Error('no channels');
      return {};
    });
    const surface = load('android');

    await surface.start(ENDS_AT, true);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith('rest-quiet', QUIET);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe('rest notification operations run one at a time, in order (R31)', () => {
  /** A promise settled from outside, for holding the permission question open. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  const lastOrder = (fn: jest.Mock) => Math.max(...fn.mock.invocationCallOrder);

  it('a Skip that lands while a start waits on the permission question cancels what that start then schedules', async () => {
    const question = deferred<Permission>();
    mockNotifications.getPermissionsAsync.mockResolvedValue(UNDETERMINED);
    mockNotifications.requestPermissionsAsync.mockReturnValue(question.promise);
    const surface = load();

    const started = surface.start(ENDS_AT, true);
    await microtasks();
    const cancelled = surface.cancel();
    await microtasks();
    // The cancel has not run yet: it waits its turn behind the start.
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);

    question.resolve(GRANTED);
    await Promise.all([started, cancelled]);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    // The last thing to happen is the cancel, so no notification is left scheduled.
    expect(lastOrder(mockNotifications.cancelScheduledNotificationAsync)).toBeGreaterThan(
      lastOrder(mockNotifications.scheduleNotificationAsync),
    );
  });

  it('a later start waits for an earlier one, so the later end is the one left scheduled', async () => {
    const question = deferred<Permission>();
    mockNotifications.getPermissionsAsync.mockResolvedValue(UNDETERMINED);
    mockNotifications.requestPermissionsAsync.mockReturnValueOnce(question.promise).mockResolvedValue(GRANTED);
    const surface = load();

    const first = surface.start(ENDS_AT, true);
    const second = surface.update(ENDS_AT + 60_000, true);
    await microtasks();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    question.resolve(GRANTED);
    await Promise.all([first, second]);

    const dates = mockNotifications.scheduleNotificationAsync.mock.calls.map((c) => c[0].trigger.date);
    expect(dates).toEqual([ENDS_AT, ENDS_AT + 60_000]);
  });

  it('a failed operation does not hold up the ones behind it', async () => {
    mockNotifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error('native error'));
    const surface = load();

    const failing = surface.start(ENDS_AT, true);
    const after = surface.cancel();

    await expect(failing).rejects.toThrow('native error');
    await expect(after).resolves.toBeUndefined();
    expect(lastOrder(mockNotifications.cancelScheduledNotificationAsync)).toBeGreaterThan(
      lastOrder(mockNotifications.scheduleNotificationAsync),
    );
  });
});

describe('getRestTimerSurface (Task 15 Step 5)', () => {
  it('is the notification surface on the phone: it loads expo-notifications and talks to it', async () => {
    let surface!: import('./index').RestTimerSurface;
    jest.isolateModules(() => {
      surface = (require('./index') as typeof import('./index')).getRestTimerSurface();
    });

    expect(mockNotifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    await surface.cancel();
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('gymhound-rest');
  });

  it('does nothing on web, and never loads expo-notifications', async () => {
    let surface!: import('./index').RestTimerSurface;
    jest.isolateModules(() => {
      // The isolated registry has its own react-native, so web is set on that copy before the module reads it.
      jest.replaceProperty((require('react-native') as { Platform: typeof Platform }).Platform, 'OS', 'web');
      surface = (require('./index') as typeof import('./index')).getRestTimerSurface();
    });

    await expect(surface.start(ENDS_AT, true)).resolves.toBeUndefined();
    await expect(surface.update(ENDS_AT, true)).resolves.toBeUndefined();
    await expect(surface.cancel()).resolves.toBeUndefined();

    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled();
    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
