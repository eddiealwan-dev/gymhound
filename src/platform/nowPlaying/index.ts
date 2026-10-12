import { requireOptionalNativeModule } from 'expo';
import { isNativeBuild, nativeEnv, type NativeEnv } from '../native/optional';
import { sourcesFor } from './rules';
import type { NowPlaying, NowPlayingAccess, NowPlayingPlayer, PlayerSource, Track } from './types';

export type { NowPlaying, NowPlayingAccess, NowPlayingPlayer, PlayerSource, Track } from './types';
export { musicBarMode, positionNow, SEEK_STEP_MS, seekTarget, trackSpoken, type MusicBarMode } from './rules';

/**
 * PHASE 7: the JS side of the two local Expo modules the music player needs (§17.3, R313). Neither exists yet; the
 * plan's "Music" task writes them (Swift: `MPMusicPlayerController.systemMusicPlayer`; Kotlin: `MediaSessionManager`
 * with a `NotificationListenerService`; Swift: Spotify's `SPTAppRemote`). `requireOptionalNativeModule` gives null for a
 * module that is not in the build, so until then, and always in Expo Go, there is no player.
 */
export const NOW_PLAYING_MODULE = 'GymHoundNowPlaying';
export const SPOTIFY_REMOTE_MODULE = 'GymHoundSpotifyRemote';
/** Where Spotify sends the user back after the one-time connect (the app's own scheme). */
export const SPOTIFY_REDIRECT_URI = 'gymhound://spotify-connect';

/** A song as the native modules report it. */
export type NativeTrack = { title: string; artist?: string | null; isPlaying: boolean; positionMs: number; durationMs?: number | null };

export interface NowPlayingModuleLike {
  getNowPlaying(): Promise<NativeTrack | null>;
  play(): Promise<void>;
  pause(): Promise<void>;
  skipToPrevious(): Promise<void>;
  skipToNext(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  addListener(event: 'onChange', listener: () => void): { remove(): void };
  /** Android only: whether GymHound's notification listener is allowed. */
  hasNotificationAccess?(): Promise<boolean>;
  /** Android only: opens Settings → Notification access. */
  openNotificationAccessSettings?(): Promise<void>;
}

export interface SpotifyRemoteModuleLike extends NowPlayingModuleLike {
  /** Connects App Remote; the first time, Spotify opens to ask, then returns to the redirect URI. */
  connect(clientId: string, redirectUri: string): Promise<boolean>;
}

export function toTrack(native: NativeTrack | null, now: number): Track | null {
  if (native === null || typeof native.title !== 'string' || native.title === '') return null;
  const duration = native.durationMs ?? null;
  return {
    title: native.title,
    artist: native.artist ?? null,
    playing: native.isPlaying === true,
    positionMs: Math.max(0, native.positionMs || 0),
    durationMs: duration !== null && duration > 0 ? duration : null,
    readAt: now,
  };
}

/** A player over one native module. `ready` runs before each read (Spotify's connect); a failed one reads as nothing. */
export function createNativePlayer(
  source: PlayerSource,
  module: NowPlayingModuleLike,
  now: () => number = Date.now,
  ready: () => Promise<boolean> = async () => true,
): NowPlayingPlayer {
  return {
    source,
    async read() {
      try {
        if (!(await ready())) return null;
        return toTrack(await module.getNowPlaying(), now());
      } catch {
        return null;
      }
    },
    onChange(listener) {
      const subscription = module.addListener('onChange', listener);
      return () => subscription.remove();
    },
    play: () => module.play(),
    pause: () => module.pause(),
    previous: () => module.skipToPrevious(),
    next: () => module.skipToNext(),
    seekTo: (positionMs) => module.seekTo(Math.round(positionMs)),
  };
}

/** Connects once; a refusal is tried again on the next read, never in a loop. */
function connectOnce(remote: SpotifyRemoteModuleLike, clientId: string): () => Promise<boolean> {
  let connected = false;
  return async () => {
    if (!connected) connected = await remote.connect(clientId, SPOTIFY_REDIRECT_URI);
    return connected;
  };
}

type RequireModule = <T>(name: string) => T | null;

/**
 * The players this build has (R313): none in Expo Go, on the web, or before the native modules exist. Spotify on
 * iPhone also needs the developer app's client id (R315); without it Spotify keeps its open button.
 */
export function loadNowPlaying(
  env: NativeEnv = nativeEnv(),
  requireModule: RequireModule = requireOptionalNativeModule,
  spotifyClientId: string | undefined = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID,
): NowPlaying {
  const none: NowPlaying = { players: [], access: null };
  if (!isNativeBuild(env)) return none;
  const clientId = spotifyClientId?.trim() || null;
  const players: NowPlayingPlayer[] = [];
  let access: NowPlayingAccess | null = null;
  try {
    for (const source of sourcesFor(env.os, clientId !== null)) {
      if (source === 'spotify') {
        const remote = requireModule<SpotifyRemoteModuleLike>(SPOTIFY_REMOTE_MODULE);
        if (remote !== null && clientId !== null) players.push(createNativePlayer(source, remote, Date.now, connectOnce(remote, clientId)));
        continue;
      }
      const system = requireModule<NowPlayingModuleLike>(NOW_PLAYING_MODULE);
      if (system === null) continue;
      players.push(createNativePlayer(source, system));
      const { hasNotificationAccess, openNotificationAccessSettings } = system;
      if (source === 'media-session' && hasNotificationAccess && openNotificationAccessSettings) {
        access = {
          granted: () => hasNotificationAccess.call(system).catch(() => false),
          openSettings: () => openNotificationAccessSettings.call(system),
        };
      }
    }
  } catch (error) {
    console.warn('GymHound: the music player is not in this build.', error);
    return none;
  }
  return { players, access };
}

let cached: NowPlaying | undefined;

/** The app's music players, found on first use. */
export function getNowPlaying(): NowPlaying {
  if (cached === undefined) cached = loadNowPlaying();
  return cached;
}
