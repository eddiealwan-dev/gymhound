// GymHound's media control module (Task 8a, R216). Types and the name only: the app reaches the
// native module through `optionalNativeModule<MediaModule>(MEDIA_MODULE)` in src/platform (R196),
// which is null in Expo Go, on the web and in Jest. Nothing here loads native code.

export const MEDIA_MODULE = 'GymHoundMedia';

/**
 * iOS: MPMediaLibrary authorisation (restricted counts as denied).
 * Android: whether GymHound's notification listener is enabled; Android cannot tell "never asked"
 * from "turned off", so it reports only 'granted' or 'denied'.
 */
export type MediaAccess = 'granted' | 'denied' | 'undetermined';

/** source: the Android package of the session's app; iOS always 'apple-music'. */
export type NowPlaying = { title: string | null; artist: string | null; playing: boolean; source: string | null };

export type MediaModule = {
  access(): Promise<MediaAccess>;
  /** iOS: MPMediaLibrary.requestAuthorization (asks once). Android: opens notification-access settings and returns the current state. */
  requestAccess(): Promise<MediaAccess>;
  /** null when no item (iOS) or no active media session / no access (Android). */
  nowPlaying(): Promise<NowPlaying | null>;
  /** play, next, previous and seekBy reject with code ERR_NO_PLAYER when there is no player to reach (iOS: no
   * nowPlayingItem; Android: no active session, and for seekBy a player without ACTION_SEEK_TO). pause on iOS never rejects. */
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  /** ±15 in the bar; clamped to 0..duration (no upper clamp when the player reports no duration). */
  seekBy(seconds: number): Promise<void>;
  /** 'change': the song, the play state or (Android) the active session changed. No payload; re-read nowPlaying(). */
  addListener(event: 'change', listener: () => void): { remove(): void };
};
