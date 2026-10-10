import { PermissionStatus } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { RestTimerSurface } from './index';

/**
 * The rest surface on the phone: one local notification, "Rest's up.", scheduled for the end of the timer.
 * The app's own bell and haptic cover the app being open; this covers it being in the background or the phone locked.
 *
 * In Expo Go `sound: true` is the system notification sound. The chosen bell on the lock screen arrives with the
 * phase 7 build. Whether the phone rings or vibrates is up to the phone's own sound settings.
 */

// Loaded off web only (see `getRestTimerSurface`). While the app is open the notification is silent and unseen: the
// rest watcher's bell and haptic are the show. It appears only when the app is in the background.
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

/**
 * Android 8 and later play a notification's sound and vibration from its channel, not from the notification, and a
 * channel's sound cannot be changed per notification. So there are two, both high importance with vibration on:
 * - `rest`: the default sound (none is named; a new channel already has it, and naming 'default' would be looked up as a
 *   raw resource and logged as an error).
 * - `rest-quiet`: no sound. It is used when the bell is off, so the lock screen still buzzes without ringing.
 * The phone's own settings can still turn either down. There are no channels on iOS or web. On iOS in Expo Go a silent
 * notification cannot vibrate, so with the bell off the iOS notification is silent.
 */
const REST_CHANNEL_ID = 'rest';
const QUIET_CHANNEL_ID = 'rest-quiet';
const onAndroid = Platform.OS === 'android';

/**
 * With `sound: false` and no vibration pattern, expo-notifications marks the Android notification silent whatever its
 * channel (it vibrates only when the request has a pattern). The pattern keeps the quiet notification from being marked
 * silent; on Android 8 and later the channel's own vibration is what is felt.
 */
const QUIET_VIBRATION = [0, 250, 250, 250];

async function makeChannel(id: string, options: Notifications.NotificationChannelInput): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(id, options);
  } catch (e) {
    // The notification still goes out, on the phone's fallback channel.
    console.warn(`GymHound: the rest notification channel '${id}' could not be created.`, e);
  }
}

async function makeRestChannels(): Promise<void> {
  if (!onAndroid) return;
  const importance = Notifications.AndroidImportance.HIGH;
  await Promise.all([
    makeChannel(REST_CHANNEL_ID, { name: 'Rest timer', importance, enableVibrate: true }),
    makeChannel(QUIET_CHANNEL_ID, { name: 'Rest timer (no sound)', importance, sound: null, enableVibrate: true }),
  ]);
}

/** Made at load. It never rejects, and a notification is scheduled only once it has settled. */
const restChannelsReady = makeRestChannels();

/** Whether notifications are allowed. Asks once, the first time a timer starts (not at launch), if the phone lets us. */
async function allowed(): Promise<boolean> {
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status === PermissionStatus.UNDETERMINED && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  return permission.granted;
}

async function schedule(endsAt: number, withSound: boolean): Promise<void> {
  // A timer started again replaces the one running, so there is never more than one notification.
  await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID);
  if (!(await allowed())) return;
  // The permission question can take a while to answer. An end that has gone by is nothing to wake the phone for.
  if (endsAt <= Date.now()) return;
  await restChannelsReady;
  const quiet = onAndroid && !withSound;
  await Notifications.scheduleNotificationAsync({
    identifier: REST_NOTIFICATION_ID,
    content: quiet
      ? { title: "Rest's up.", sound: false, vibrate: QUIET_VIBRATION }
      : { title: "Rest's up.", sound: withSound },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: endsAt,
      ...(onAndroid ? { channelId: withSound ? REST_CHANNEL_ID : QUIET_CHANNEL_ID } : null),
    },
  });
}

/**
 * Every operation waits for the one before it. A start can wait on the permission question for a long time, and a Skip
 * or a −15s down to zero that landed meanwhile must act after it, or the skipped rest's notification would be scheduled
 * behind the cancel and ring. A failed operation reports to its own caller and never holds up the next.
 */
let queue: Promise<void> = Promise.resolve();

function inTurn(operation: () => Promise<void>): Promise<void> {
  const run = queue.then(operation);
  queue = run.catch(() => {});
  return run;
}

export const expoGoNotification: RestTimerSurface = {
  start: (endsAt, withSound) => inTurn(() => schedule(endsAt, withSound)),
  update: (endsAt, withSound) => inTurn(() => schedule(endsAt, withSound)),
  cancel: () => inTurn(() => Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID)),
};
