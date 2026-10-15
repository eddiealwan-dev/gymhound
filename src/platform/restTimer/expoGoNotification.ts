import { PermissionStatus } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { BellSound } from '../../domain/types';
import { isNativeBuild } from '../native/optional';
import type { RestTimerSurface, WorkCueSurface } from './index';
import { BELL_SOUNDS, bellChannelId, bellFile, lockScreenSound, QUIET_CHANNEL_ID, REST_CHANNEL_ID } from './lockScreenSound';

/**
 * The rest surface on the phone: one local notification, "Rest's up.", scheduled for the end of the timer.
 * The app's own bell and haptic cover the app being open; this covers it being in the background or the phone locked.
 *
 * In Expo Go `sound: true` is the system notification sound. A development or store build bundles the bells, so there the
 * notification rings the bell chosen in Settings (phase 7, R304, `lockScreenSound`). Whether the phone rings or vibrates
 * is up to the phone's own sound settings.
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
const os = Platform.OS;
const onAndroid = os === 'android';
/** Phase 7: whether this build bundles the bells as notification sounds (never Expo Go). Read once, at load. */
const customSounds = isNativeBuild();

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
    // Phase 7 (R304): one channel per bundled bell, since a channel's sound is fixed once it is made. Only in a build
    // that bundles them: in Expo Go the raw resources do not exist.
    ...(customSounds
      ? BELL_SOUNDS.map((sound) =>
          makeChannel(bellChannelId(sound), { name: `Rest timer (${sound})`, importance, sound: bellFile(sound), enableVibrate: true }),
        )
      : []),
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

async function schedule(endsAt: number, withSound: boolean, sound?: BellSound): Promise<void> {
  // A timer started again replaces the one running, so there is never more than one notification.
  await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID);
  if (!(await allowed())) return;
  // The permission question can take a while to answer. An end that has gone by is nothing to wake the phone for.
  if (endsAt <= Date.now()) return;
  await restChannelsReady;
  const quiet = onAndroid && !withSound;
  const chosen = lockScreenSound({ os, withSound, sound, customSounds });
  await Notifications.scheduleNotificationAsync({
    identifier: REST_NOTIFICATION_ID,
    content: quiet
      ? { title: "Rest's up.", sound: false, vibrate: QUIET_VIBRATION }
      : { title: "Rest's up.", sound: chosen.sound },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: endsAt,
      ...(chosen.channelId !== null ? { channelId: chosen.channelId } : null),
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
  start: (endsAt, withSound, sound) => inTurn(() => schedule(endsAt, withSound, sound)),
  update: (endsAt, withSound, sound) => inTurn(() => schedule(endsAt, withSound, sound)),
  cancel: () => inTurn(() => Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID)),
};

/**
 * The work clock's cues on the lock screen (Task 7b, R-t7b1): each one its own notification, "Go.", "Easy.", "Hard. 2 of
 * 6.", "Minute 4.", "Time.", with fixed identifiers, so every one can be cancelled after a reload or a kill. At most
 * `WORK_CUE_LIMIT` at once; iOS keeps 64 pending for the whole app, and the rest timer takes one.
 */
const WORK_CUE_LIMIT = 30;
const WORK_CUE_IDS = Array.from({ length: WORK_CUE_LIMIT }, (_, i) => `gymhound-work-${i}`);

async function cancelCues(): Promise<void> {
  await Promise.all(WORK_CUE_IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

async function scheduleCues(cues: readonly { at: number; title: string }[], withSound: boolean, sound?: BellSound): Promise<void> {
  await cancelCues();
  if (!(await allowed())) return;
  const ahead = cues.filter((c) => c.at > Date.now()).slice(0, WORK_CUE_LIMIT);
  if (ahead.length === 0) return;
  await restChannelsReady;
  const quiet = onAndroid && !withSound;
  const chosen = lockScreenSound({ os, withSound, sound, customSounds });
  for (let i = 0; i < ahead.length; i++) {
    const { at, title } = ahead[i];
    await Notifications.scheduleNotificationAsync({
      identifier: WORK_CUE_IDS[i],
      content: quiet ? { title, sound: false, vibrate: QUIET_VIBRATION } : { title, sound: chosen.sound },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        ...(chosen.channelId !== null ? { channelId: chosen.channelId } : null),
      },
    });
  }
}

export const workCueNotifications: WorkCueSurface = {
  schedule: (cues, withSound, sound) => inTurn(() => scheduleCues(cues, withSound, sound)),
  cancel: () => inTurn(cancelCues),
};
