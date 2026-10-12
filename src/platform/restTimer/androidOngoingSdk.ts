import { loadOptional } from '../native/optional';
import { ONGOING_CHANNEL_ID, type OngoingNotification, type OngoingSdk } from './androidOngoing';

/**
 * PHASE 7 (Android build): notifee behind `OngoingSdk`. The only file that names `@notifee/react-native`, and only
 * through `loadOptional`, so Expo Go never loads it. The types are the slice of notifee 9 GymHound uses, written here
 * because the package is not installed until phase 7. Not unit-tested (Jest has no native module).
 */

/** notifee's `AndroidImportance.LOW`: shown in the shade and on the lock screen, no sound, no peek. */
const IMPORTANCE_LOW = 2;

type Notifee = {
  createChannel(channel: { id: string; name: string; importance: number; vibration: boolean; sound?: string }): Promise<string>;
  displayNotification(notification: OngoingNotification): Promise<string>;
  cancelNotification(id: string): Promise<void>;
};

/** The ongoing-notification adapter, or null in Expo Go, on iOS or the web, or when notifee is not in this build. */
export function loadOngoingSdk(): OngoingSdk | null {
  const module = loadOptional<{ default?: Notifee }>(() => require('@notifee/react-native'));
  const notifee = module?.default;
  if (!notifee || typeof notifee.displayNotification !== 'function') return null;
  return {
    async makeChannel() {
      await notifee.createChannel({ id: ONGOING_CHANNEL_ID, name: 'Rest countdown', importance: IMPORTANCE_LOW, vibration: false });
    },
    async show(notification) {
      await notifee.displayNotification(notification);
    },
    hide: (id) => notifee.cancelNotification(id),
  };
}
