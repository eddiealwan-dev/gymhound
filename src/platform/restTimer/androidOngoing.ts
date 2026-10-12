import type { RestTimerSurface } from './index';

/**
 * PHASE 7 (Android build): the rest timer's ongoing notification (R301). While a rest runs, the shade and the lock screen
 * show "Rest" with a countdown (Android's chronometer, counting down to the end), and it cannot be swiped away. It is
 * silent: the scheduled "Rest's up." notification still rings at zero. It removes itself at the end (`timeoutAfter`),
 * so a rest that ends while GymHound sleeps leaves nothing behind. Skip, Finish, Discard and the rest being seen over
 * take it down at once.
 */

export const ONGOING_CHANNEL_ID = 'rest-ongoing';
export const ONGOING_NOTIFICATION_ID = 'gymhound-rest-ongoing';

/** The notification as notifee takes it (`displayNotification`). */
export type OngoingNotification = {
  id: string;
  title: string;
  android: {
    channelId: string;
    ongoing: true;
    onlyAlertOnce: true;
    autoCancel: false;
    showChronometer: true;
    chronometerDirection: 'down';
    timestamp: number;
    timeoutAfter: number;
    pressAction: { id: 'default' };
  };
};

/** The ongoing notification for a rest ending at `endsAt`, or null when that end has already gone by. */
export function ongoingNotification(endsAt: number, now: number): OngoingNotification | null {
  const left = endsAt - now;
  if (left <= 0) return null;
  return {
    id: ONGOING_NOTIFICATION_ID,
    title: 'Rest',
    android: {
      channelId: ONGOING_CHANNEL_ID,
      ongoing: true,
      onlyAlertOnce: true,
      autoCancel: false,
      showChronometer: true,
      chronometerDirection: 'down',
      timestamp: endsAt,
      timeoutAfter: left,
      pressAction: { id: 'default' },
    },
  };
}

/** The narrow adapter over notifee (`androidOngoingSdk.ts`); tests pass a fake. */
export interface OngoingSdk {
  /** Makes the silent, low-importance channel. Called before the first notification. */
  makeChannel(): Promise<void>;
  /** Shows or replaces the notification with the same id. */
  show(notification: OngoingNotification): Promise<void>;
  hide(id: string): Promise<void>;
}

export function createAndroidOngoingSurface(sdk: OngoingSdk, now: () => number = Date.now): RestTimerSurface {
  let channel: Promise<void> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const inTurn = (operation: () => Promise<void>): Promise<void> => {
    const run = queue.then(operation);
    queue = run.catch(() => {});
    return run;
  };
  const channelReady = () => {
    channel ??= sdk.makeChannel().catch((e) => {
      channel = null;
      throw e;
    });
    return channel;
  };
  const show = async (endsAt: number) => {
    const notification = ongoingNotification(endsAt, now());
    if (notification === null) return sdk.hide(ONGOING_NOTIFICATION_ID);
    await channelReady();
    await sdk.show(notification);
  };
  const hide = () => sdk.hide(ONGOING_NOTIFICATION_ID);
  return {
    start: (endsAt) => inTurn(() => show(endsAt)),
    update: (endsAt) => inTurn(() => show(endsAt)),
    cancel: () => inTurn(hide),
    ended: () => inTurn(hide),
  };
}
