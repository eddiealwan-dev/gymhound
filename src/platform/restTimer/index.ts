import { Platform } from 'react-native';

/**
 * What the phone shows for a running rest timer while the app cannot: a notification at the end time, "Rest's up.",
 * which rings and vibrates as the phone's own sound settings allow. The rest bar and the in-app bell do not depend on it.
 */
export interface RestTimerSurface {
  /** Schedules the notification for `endsAt` (epoch ms), with the phone's sound when `withSound`. Replaces one already scheduled. */
  start(endsAt: number, withSound: boolean): Promise<void>;
  /** The timer now ends at `endsAt`: reschedules. */
  update(endsAt: number, withSound: boolean): Promise<void>;
  /** The timer was skipped: cancels the notification. */
  cancel(): Promise<void>;
}

const noopSurface: RestTimerSurface = {
  start: async () => {},
  update: async () => {},
  cancel: async () => {},
};

/**
 * The rest surface: nothing on web, and the local notification (`expoGoNotification`) on the phone.
 * That module registers the notification handler when it loads, so it is loaded only here, only off web.
 */
export function getRestTimerSurface(): RestTimerSurface {
  if (Platform.OS === 'web') return noopSurface;
  return (require('./expoGoNotification') as typeof import('./expoGoNotification')).expoGoNotification;
}
