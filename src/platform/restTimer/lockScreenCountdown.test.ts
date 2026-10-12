import { combineSurfaces, lockScreenCountdownFor } from './chooseSurface';
import { createAndroidOngoingSurface, ongoingNotification, ONGOING_NOTIFICATION_ID, type OngoingSdk } from './androidOngoing';
import type { RestTimerSurface } from './index';
import { createLiveActivitySurface, type RestActivityFactory, type RestActivityHandle } from './liveActivity';
import { lockScreenSound } from './lockScreenSound';

const NOW = 1_000_000_000_000;
const now = () => NOW;

describe('lockScreenCountdownFor (R301)', () => {
  it('is a Live Activity in an iOS build and the ongoing notification in an Android build', () => {
    expect(lockScreenCountdownFor({ os: 'ios', expoGo: false })).toBe('liveActivity');
    expect(lockScreenCountdownFor({ os: 'android', expoGo: false })).toBe('androidOngoing');
  });

  it('is nothing in Expo Go or on the web, so the notification alone stays (today)', () => {
    expect(lockScreenCountdownFor({ os: 'ios', expoGo: true })).toBeNull();
    expect(lockScreenCountdownFor({ os: 'android', expoGo: true })).toBeNull();
    expect(lockScreenCountdownFor({ os: 'web', expoGo: false })).toBeNull();
  });
});

describe('lockScreenSound (R304)', () => {
  it('rings the chosen bell in a build that bundles it', () => {
    expect(lockScreenSound({ os: 'ios', withSound: true, sound: 'chime', customSounds: true })).toEqual({ sound: 'chime.wav', channelId: null });
    expect(lockScreenSound({ os: 'android', withSound: true, sound: 'ding', customSounds: true })).toEqual({
      sound: 'ding.wav',
      channelId: 'rest-ding',
    });
  });

  it('uses the system sound in Expo Go, or when no bell is named', () => {
    expect(lockScreenSound({ os: 'ios', withSound: true, sound: 'chime', customSounds: false })).toEqual({ sound: true, channelId: null });
    expect(lockScreenSound({ os: 'android', withSound: true, customSounds: true })).toEqual({ sound: true, channelId: 'rest' });
  });

  it('is silent with the bell off, on the quiet channel on Android', () => {
    expect(lockScreenSound({ os: 'android', withSound: false, sound: 'bell', customSounds: true })).toEqual({
      sound: false,
      channelId: 'rest-quiet',
    });
    expect(lockScreenSound({ os: 'ios', withSound: false, sound: 'bell', customSounds: true })).toEqual({ sound: false, channelId: null });
  });
});

function fakeSurface(): RestTimerSurface & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    start: jest.fn(async (endsAt: number, withSound: boolean, sound?: string) => {
      calls.push(`start ${endsAt} ${withSound} ${sound}`);
    }),
    update: jest.fn(async (endsAt: number) => {
      calls.push(`update ${endsAt}`);
    }),
    cancel: jest.fn(async () => {
      calls.push('cancel');
    }),
  };
}

describe('combineSurfaces', () => {
  it('tells every surface every change, with the bell', async () => {
    const a = fakeSurface();
    const b = { ...fakeSurface(), ended: jest.fn(async () => {}) };
    const both = combineSurfaces(a, b);

    await both.start(5, true, 'chime');
    await both.update(6, true, 'chime');
    await both.cancel();
    await both.ended!();

    expect(a.calls).toEqual(['start 5 true chime', 'update 6', 'cancel']);
    expect(b.calls).toEqual(['start 5 true chime', 'update 6', 'cancel']);
    expect(b.ended).toHaveBeenCalledTimes(1);
  });

  it('still tells the others when one fails, then reports the failure', async () => {
    const failing = { ...fakeSurface(), start: jest.fn(async () => Promise.reject(new Error('no'))) };
    const other = fakeSurface();
    await expect(combineSurfaces(failing, other).start(5, true)).rejects.toThrow('no');
    expect(other.calls).toEqual(['start 5 true undefined']);
  });

  it('also reports a surface that throws instead of rejecting', async () => {
    const throwing = {
      ...fakeSurface(),
      cancel: () => {
        throw new Error('thrown');
      },
    };
    const other = fakeSurface();
    await expect(combineSurfaces(throwing, other).cancel()).rejects.toThrow('thrown');
    expect(other.calls).toEqual(['cancel']);
  });
});

type FakeHandle = RestActivityHandle & { log: string[]; ended: boolean };

function fakeFactory(leftovers = 0) {
  const started: FakeHandle[] = [];
  const handle = (name: string): FakeHandle => {
    const h: FakeHandle = {
      log: [],
      ended: false,
      update: jest.fn(async (props, stale) => {
        h.log.push(`${name} update ${props.startedAt}-${props.endsAt} stale ${stale.getTime()}`);
      }),
      end: jest.fn(async () => {
        h.ended = true;
      }),
    };
    return h;
  };
  const old = Array.from({ length: leftovers }, (_, i) => handle(`old${i}`));
  const factory: RestActivityFactory & { starts: { startedAt: number; endsAt: number; stale: number }[] } = {
    starts: [],
    start: jest.fn((props, stale) => {
      factory.starts.push({ ...props, stale: stale.getTime() });
      const h = handle(`a${started.length}`);
      started.push(h);
      return h;
    }),
    running: jest.fn(() => [...old, ...started.filter((h) => !h.ended)]),
  };
  return { factory, started, old };
}

describe('the Live Activity surface (R301)', () => {
  it('starts one activity for the rest, stale at its end, after ending any left from before', async () => {
    const { factory, old } = fakeFactory(2);
    const surface = createLiveActivitySurface(factory, now);

    await surface.start(NOW + 120_000, true);

    expect(old.every((h) => h.ended)).toBe(true);
    expect(factory.starts).toEqual([{ startedAt: NOW, endsAt: NOW + 120_000, stale: NOW + 120_000 }]);
  });

  it('a new tick ends the running activity and starts another', async () => {
    const { factory, started } = fakeFactory();
    const surface = createLiveActivitySurface(factory, now);

    await surface.start(NOW + 60_000, true);
    await surface.start(NOW + 90_000, true);

    expect(started).toHaveLength(2);
    expect(started[0].ended).toBe(true);
    expect(started[1].ended).toBe(false);
  });

  it('moves the end on −15s and +15s, keeping when the rest began', async () => {
    let clock = NOW;
    const { factory, started } = fakeFactory();
    const surface = createLiveActivitySurface(factory, () => clock);

    await surface.start(NOW + 120_000, true);
    clock = NOW + 30_000;
    await surface.update(NOW + 135_000, true);

    expect(started[0].log).toEqual([`a0 update ${NOW}-${NOW + 135_000} stale ${NOW + 135_000}`]);
  });

  it('ends it on Skip, finish or discard, and once the rest has been seen over', async () => {
    const { factory, started } = fakeFactory();
    const surface = createLiveActivitySurface(factory, now);

    await surface.start(NOW + 60_000, true);
    await surface.cancel();
    expect(started[0].ended).toBe(true);

    await surface.start(NOW + 60_000, true);
    await surface.ended!();
    expect(started[1].ended).toBe(true);
  });

  it('starts nothing for an end already gone by, and an update to a past end ends it', async () => {
    const { factory, started } = fakeFactory();
    const surface = createLiveActivitySurface(factory, now);

    await surface.start(NOW, true);
    expect(started).toHaveLength(0);

    await surface.start(NOW + 10_000, true);
    await surface.update(NOW - 1, true);
    expect(started[0].ended).toBe(true);
  });

  it('starts one when an update arrives with nothing running (after a reload)', async () => {
    const { factory } = fakeFactory();
    const surface = createLiveActivitySurface(factory, now);

    await surface.update(NOW + 45_000, true);

    expect(factory.starts).toEqual([{ startedAt: NOW, endsAt: NOW + 45_000, stale: NOW + 45_000 }]);
  });

  it('runs operations in order: a cancel right after a start ends what the start made', async () => {
    const { factory, started } = fakeFactory();
    const surface = createLiveActivitySurface(factory, now);

    const a = surface.start(NOW + 60_000, true);
    const b = surface.cancel();
    await Promise.all([a, b]);

    expect(started).toHaveLength(1);
    expect(started[0].ended).toBe(true);
  });
});

describe('the Android ongoing notification (R301)', () => {
  it('counts down to the end, cannot be swiped away, never alerts twice and removes itself at the end', () => {
    expect(ongoingNotification(NOW + 90_000, NOW)).toEqual({
      id: ONGOING_NOTIFICATION_ID,
      title: 'Rest',
      android: {
        channelId: 'rest-ongoing',
        ongoing: true,
        onlyAlertOnce: true,
        autoCancel: false,
        showChronometer: true,
        chronometerDirection: 'down',
        timestamp: NOW + 90_000,
        timeoutAfter: 90_000,
        pressAction: { id: 'default' },
      },
    });
    expect(ongoingNotification(NOW, NOW)).toBeNull();
  });

  function fakeSdk(): OngoingSdk & { log: string[] } {
    const log: string[] = [];
    return {
      log,
      makeChannel: jest.fn(async () => {
        log.push('channel');
      }),
      show: jest.fn(async (n) => {
        log.push(`show ${n.android.timestamp}`);
      }),
      hide: jest.fn(async (id) => {
        log.push(`hide ${id}`);
      }),
    };
  }

  it('makes its channel once, shows on start, replaces on a moved end and hides on cancel and when seen over', async () => {
    const sdk = fakeSdk();
    const surface = createAndroidOngoingSurface(sdk, now);

    await surface.start(NOW + 60_000, true);
    await surface.update(NOW + 75_000, true);
    await surface.cancel();
    await surface.start(NOW + 60_000, false);
    await surface.ended!();

    expect(sdk.log).toEqual([
      'channel',
      `show ${NOW + 60_000}`,
      `show ${NOW + 75_000}`,
      `hide ${ONGOING_NOTIFICATION_ID}`,
      `show ${NOW + 60_000}`,
      `hide ${ONGOING_NOTIFICATION_ID}`,
    ]);
  });

  it('hides instead of showing an end already gone by', async () => {
    const sdk = fakeSdk();
    await createAndroidOngoingSurface(sdk, now).update(NOW - 5, true);
    expect(sdk.log).toEqual([`hide ${ONGOING_NOTIFICATION_ID}`]);
  });

  it('tries the channel again after it failed', async () => {
    const sdk = fakeSdk();
    (sdk.makeChannel as jest.Mock).mockRejectedValueOnce(new Error('busy'));
    const surface = createAndroidOngoingSurface(sdk, now);

    await expect(surface.start(NOW + 60_000, true)).rejects.toThrow('busy');
    await surface.start(NOW + 60_000, true);

    expect(sdk.makeChannel).toHaveBeenCalledTimes(2);
    expect(sdk.show).toHaveBeenCalledTimes(1);
  });
});
