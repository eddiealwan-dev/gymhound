import type { BellSound } from '../../domain/types';

/**
 * Which sound the "Rest's up." notification carries, and on Android which channel it goes out on (§8.4, R304).
 *
 * In Expo Go a notification can only use the system sound. A development or store build bundles the three bells as
 * notification sounds (plugins/nativeConfig.js), so there the lock screen rings the bell chosen in Settings:
 * - iOS names the file in the notification (`bell.wav`).
 * - Android 8+ takes the sound from the channel (made with the same file name), and a channel's sound can never change
 *   once made, so each bell has its own channel (`rest-bell`, `rest-chime`, `rest-ding`), playing it from `res/raw`.
 * The bell volume (Settings) cannot reach a notification: the phone's own notification volume sets it.
 * With the bell off nothing rings; on Android the quiet channel still buzzes.
 */

export const REST_CHANNEL_ID = 'rest';
export const QUIET_CHANNEL_ID = 'rest-quiet';

/** The Android channel for a bundled bell. */
export const bellChannelId = (sound: BellSound): string => `rest-${sound}`;

/** The bundled file a bell rings from (iOS names it in the notification; Android's channel looks up its base name in `res/raw`). */
export const bellFile = (sound: BellSound): string => `${sound}.wav`;

export const BELL_SOUNDS: BellSound[] = ['bell', 'chime', 'ding'];

export type LockScreenSound = {
  /** What `content.sound` gets: false (silent), true (the system sound) or a bundled file name. */
  sound: boolean | string;
  /** The Android channel; null on iOS. */
  channelId: string | null;
};

/**
 * The notification's sound and channel. `sound` is the bell chosen in Settings, or undefined when the caller did not
 * say (the system sound, as in Expo Go). `customSounds` is true only in a build that bundles the bells (not Expo Go).
 */
export function lockScreenSound(opts: { os: string; withSound: boolean; sound?: BellSound; customSounds: boolean }): LockScreenSound {
  const android = opts.os === 'android';
  const custom = opts.customSounds && opts.sound !== undefined ? opts.sound : null;
  if (!opts.withSound) return { sound: false, channelId: android ? QUIET_CHANNEL_ID : null };
  if (custom === null) return { sound: true, channelId: android ? REST_CHANNEL_ID : null };
  return { sound: bellFile(custom), channelId: android ? bellChannelId(custom) : null };
}
