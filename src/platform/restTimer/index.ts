import { Platform } from 'react-native';
import type { BellSound } from '../../domain/types';
import { nativeEnv } from '../native/optional';

/**
 * What the phone shows for a running rest timer while the app cannot: a notification at the end time, "Rest's up.",
 * which rings and vibrates as the phone's own sound settings allow. The rest bar and the in-app bell do not depend on it.
 * In a phase 7 build a live countdown joins it on the lock screen (`chooseSurface.ts`).
 */
export interface RestTimerSurface {
  /**
   * Schedules the notification for `endsAt` (epoch ms), with a sound when `withSound`: the bell `sound` chosen in
   * Settings where the build bundles it (phase 7), else the phone's own. Replaces one already scheduled.
   */
  start(endsAt: number, withSound: boolean, sound?: BellSound): Promise<void>;
  /** The timer now ends at `endsAt`: reschedules. */
  update(endsAt: number, withSound: boolean, sound?: BellSound): Promise<void>;
  /** The timer was skipped (or the workout finished or discarded): cancels the notification. */
  cancel(): Promise<void>;
  /**
   * Phase 7: the rest is over and the app has shown it. The notification has fired and is left alone; a live countdown
   * (Live Activity, ongoing notification) is taken down. Optional: the notification surface has nothing to do.
   */
  ended?(): Promise<void>;
}

const noopSurface: RestTimerSurface = {
  start: async () => {},
  update: async () => {},
  cancel: async () => {},
};

let phoneSurface: RestTimerSurface | null = null;

/** The notification, plus the build's live countdown when it has one (Live Activity or ongoing notification). */
function makePhoneSurface(): RestTimerSurface {
  const notification = (require('./expoGoNotification') as typeof import('./expoGoNotification')).expoGoNotification;
  const { combineSurfaces, lockScreenCountdownFor } = require('./chooseSurface') as typeof import('./chooseSurface');
  let countdown: RestTimerSurface | null = null;
  switch (lockScreenCountdownFor(nativeEnv())) {
    case 'liveActivity': {
      const factory = (require('./liveActivitySdk') as typeof import('./liveActivitySdk')).loadRestActivityFactory();
      if (factory) countdown = (require('./liveActivity') as typeof import('./liveActivity')).createLiveActivitySurface(factory);
      break;
    }
    case 'androidOngoing': {
      const sdk = (require('./androidOngoingSdk') as typeof import('./androidOngoingSdk')).loadOngoingSdk();
      if (sdk) countdown = (require('./androidOngoing') as typeof import('./androidOngoing')).createAndroidOngoingSurface(sdk);
      break;
    }
    case null:
      break;
  }
  return countdown ? combineSurfaces(notification, countdown) : notification;
}

/**
 * The rest surface: nothing on web; on the phone the local notification (`expoGoNotification`), and in a phase 7 build
 * also the lock-screen countdown. In Expo Go it is the notification alone, as before. That module registers the
 * notification handler when it loads, so it is loaded only here, only off web. Made once, on first use.
 */
export function getRestTimerSurface(): RestTimerSurface {
  if (Platform.OS === 'web') return noopSurface;
  phoneSurface ??= makePhoneSurface();
  return phoneSurface;
}

/**
 * The work clock's cues on a locked phone (Task 7b, R-t7b1): every bell still to come, each its own notification.
 * Scheduling replaces the ones before; cancel takes them all down (Pause, Done, Reset, Finish, Discard).
 */
export interface WorkCueSurface {
  schedule(cues: readonly { at: number; title: string }[], withSound: boolean, sound?: BellSound): Promise<void>;
  cancel(): Promise<void>;
}

const noopCues: WorkCueSurface = { schedule: async () => {}, cancel: async () => {} };

/** The cue surface: nothing on web; the notifications on the phone (loaded only off web, as the rest surface is). */
export function getWorkCueSurface(): WorkCueSurface {
  if (Platform.OS === 'web') return noopCues;
  return (require('./expoGoNotification') as typeof import('./expoGoNotification')).workCueNotifications;
}
