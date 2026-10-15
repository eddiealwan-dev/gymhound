import { Platform } from 'react-native';

// expo-notifications is native: the module is driven against a stand-in, and the calls it makes are read (R-t7b1).
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
jest.mock('../runtime', () => ({ ...jest.requireActual('../runtime'), isExpoGo: () => true }));

const NOW = 1_000_000_000_000;

function load(os: 'ios' | 'android' = 'ios'): typeof import('./expoGoNotification').workCueNotifications {
  let surface!: typeof import('./expoGoNotification').workCueNotifications;
  jest.isolateModules(() => {
    jest.replaceProperty((require('react-native') as { Platform: typeof Platform }).Platform, 'OS', os);
    surface = (require('./expoGoNotification') as typeof import('./expoGoNotification')).workCueNotifications;
  });
  return surface;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  Object.values(mockNotifications).forEach((fn) => typeof fn === 'function' && fn.mockReset());
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
  mockNotifications.scheduleNotificationAsync.mockResolvedValue('id');
  mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  mockNotifications.setNotificationChannelAsync.mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

const ids = () => mockNotifications.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0] as string);

describe('the work clock on the lock screen (R-t7b1)', () => {
  it('schedules each cue as its own notification, at its time, with the sound asked for', async () => {
    const surface = load();
    await surface.schedule(
      [
        { at: NOW + 10_000, title: 'Go.' },
        { at: NOW + 190_000, title: 'Easy.' },
      ],
      true,
    );
    const calls = mockNotifications.scheduleNotificationAsync.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      { identifier: 'gymhound-work-0', content: { title: 'Go.', sound: true }, trigger: { type: 'date', date: NOW + 10_000 } },
      { identifier: 'gymhound-work-1', content: { title: 'Easy.', sound: true }, trigger: { type: 'date', date: NOW + 190_000 } },
    ]);
  });

  it('first cancels every cue it may have left, all 30, even after a reload', async () => {
    const surface = load();
    await surface.schedule([{ at: NOW + 10_000, title: 'Go.' }], false);
    expect(ids()).toEqual(Array.from({ length: 30 }, (_, i) => `gymhound-work-${i}`));
  });

  it('cancels all 30 on Pause, Done, Reset, Finish and Discard', async () => {
    const surface = load();
    await surface.cancel();
    expect(ids()).toHaveLength(30);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never schedules more than 30, and nothing already past', async () => {
    const surface = load();
    const cues = Array.from({ length: 40 }, (_, i) => ({ at: NOW - 5_000 + i * 60_000, title: `Minute ${i}.` }));
    await surface.schedule(cues, true);
    const calls = mockNotifications.scheduleNotificationAsync.mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(30);
    expect(calls[0].content.title).toBe('Minute 1.');
  });

  it('schedules nothing when notifications are not allowed', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false });
    const surface = load();
    await surface.schedule([{ at: NOW + 10_000, title: 'Go.' }], true);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('buzzes without a sound on Android when the bell is off, on the quiet channel', async () => {
    const surface = load('android');
    await surface.schedule([{ at: NOW + 10_000, title: 'Go.' }], false);
    const [call] = mockNotifications.scheduleNotificationAsync.mock.calls.map((c) => c[0]);
    expect(call.content).toEqual({ title: 'Go.', sound: false, vibrate: [0, 250, 250, 250] });
  });
});
