import { PermissionStatus } from 'expo';
import * as Notifications from 'expo-notifications';
import type { RestTimerSurface } from './index';

/**
 * The rest surface on the phone: one local notification, "Rest's up.", scheduled for the end of the timer.
 * The app's own bell and haptic cover the app being open; this covers it being in the background or the phone locked.
 *
 * In Expo Go `sound: true` is the system notification sound. The chosen bell on the lock screen arrives with the
 * phase 7 build. Whether the phone rings or vibrates is up to the phone's own sound settings.
 */

// Loaded off web only (see `getRestTimerSurface`). While the app is open the notification is silent and unseen: the
// rest bar and the in-app bell are the show. It appears only when the app is in the background.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * The one rest notification has a fixed identifier. Scheduling with it replaces any earlier one, and cancelling by it
 * still works after the app was reloaded or killed, when a remembered id would be gone.
 */
const REST_NOTIFICATION_ID = 'gymhound-rest';

/** Whether notifications are allowed. Asks once, the first time a timer starts (not at launch), if the phone lets us. */
async function allowed(): Promise<boolean> {
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status === PermissionStatus.UNDETERMINED && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  return permission.granted;
}

async function start(endsAt: number, withSound: boolean): Promise<void> {
  // A timer started again replaces the one running, so there is never more than one notification.
  await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID);
  if (!(await allowed())) return;
  // The permission question can take a while to answer. An end that has gone by is nothing to wake the phone for.
  if (endsAt <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REST_NOTIFICATION_ID,
    content: { title: "Rest's up.", sound: withSound },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt },
  });
}

export const expoGoNotification: RestTimerSurface = {
  start,
  update: (endsAt, withSound) => start(endsAt, withSound),
  cancel: () => Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID),
};
