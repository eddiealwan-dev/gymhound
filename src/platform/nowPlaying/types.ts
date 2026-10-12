/**
 * PHASE 7: the session's music player (spec §17.3, R313–R315), behind one interface.
 *
 * - `media-session` (Android): any player that publishes a media session (Spotify, Apple Music, YouTube Music...), read
 *   and controlled through the phone's media controls once the user grants notification access.
 * - `apple-music` (iPhone): Apple's system music player, which is Apple Music's own queue.
 * - `spotify` (iPhone): Spotify's App Remote SDK, after a one-time connect in the Spotify app. Only when GymHound is
 *   registered as a Spotify developer app (`EXPO_PUBLIC_SPOTIFY_CLIENT_ID`); until then Spotify gets the open button.
 *
 * Every player is a local Expo module that does not exist yet (docs/superpowers/plans/2026-10-12-gymhound-phase-7-8.md,
 * "Music"). Until it does, and always in Expo Go and on the web, there is no player and the music bar keeps its Open
 * button (Task 26).
 */

export type PlayerSource = 'media-session' | 'apple-music' | 'spotify';

/** The song a player has loaded, playing or paused. */
export type Track = {
  title: string;
  artist: string | null;
  playing: boolean;
  /** Where in the song, as of `readAt`. */
  positionMs: number;
  /** Null for a stream with no length (radio): no seeking then. */
  durationMs: number | null;
  /** When the player was read (epoch ms), so the position can run on between readings. */
  readAt: number;
};

export interface NowPlayingPlayer {
  readonly source: PlayerSource;
  /** The loaded song, or null when the player has none (or cannot be reached). Never throws. */
  read(): Promise<Track | null>;
  /** Called when the song, or playing / paused, changes. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  play(): Promise<void>;
  pause(): Promise<void>;
  previous(): Promise<void>;
  next(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
}

/** Android's one-time notification access, without which no media session can be read. */
export interface NowPlayingAccess {
  granted(): Promise<boolean>;
  /** Opens the phone's notification-access settings at GymHound. */
  openSettings(): Promise<void>;
}

export type NowPlaying = { players: NowPlayingPlayer[]; access: NowPlayingAccess | null };
