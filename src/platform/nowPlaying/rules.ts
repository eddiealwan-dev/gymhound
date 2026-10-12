import type { MusicAppId } from '../../domain/types';
import { musicAppsFor } from '../music';
import type { PlayerSource, Track } from './types';

/** Skip back and skip forward move this far inside the song (§17.3). */
export const SEEK_STEP_MS = 15_000;

/** The apps the bar offers to open when nothing is loaded (§17.3), as far as this platform has them. */
const OPEN_BUTTONS: MusicAppId[] = ['apple-music', 'spotify'];

/** Where the song is now: a playing song's position runs on from when it was read, up to its end. */
export function positionNow(track: Track, now: number): number {
  const ran = track.playing ? Math.max(0, now - track.readAt) : 0;
  const at = track.positionMs + ran;
  return track.durationMs === null ? at : Math.min(at, track.durationMs);
}

/**
 * Where a 15-second skip lands (`step` is +1 or -1), kept inside the song: back from the first seconds goes to 0, and
 * forward near the end stops at the end, which the player treats as the song finishing. Null when the song cannot seek.
 */
export function seekTarget(track: Track, step: 1 | -1, now: number): number | null {
  if (track.durationMs === null) return null;
  const to = positionNow(track, now) + step * SEEK_STEP_MS;
  return Math.max(0, Math.min(track.durationMs, to));
}

/** What each platform's player can be (R313): Android's media session; Apple Music, and Spotify once registered, on iPhone. */
export function sourcesFor(os: string, spotifyRegistered: boolean): PlayerSource[] {
  if (os === 'android') return ['media-session'];
  if (os === 'ios') return spotifyRegistered ? ['apple-music', 'spotify'] : ['apple-music'];
  return [];
}

export type Reading = { source: PlayerSource; track: Track | null };

export type MusicBarMode =
  | { kind: 'controls'; source: PlayerSource; track: Track; canSeek: boolean }
  /** Nothing loaded: open buttons, plus a prompt for Android's notification access while it is missing. */
  | { kind: 'open'; apps: MusicAppId[]; askAccess: boolean };

/**
 * What the music bar shows (§17.3, R314). A loaded song gets the controls, a paused one too (a pause between sets is
 * still "what is playing"); a playing song beats a paused one, then the newest reading wins. With nothing loaded, the
 * open buttons, Apple Music first, as this platform has them.
 */
export function musicBarMode(os: string, readings: Reading[], androidAccess: boolean | null = null): MusicBarMode {
  const loaded = readings.filter((r): r is Reading & { track: Track } => r.track !== null);
  const pick = [...loaded].sort((a, b) => Number(b.track.playing) - Number(a.track.playing) || b.track.readAt - a.track.readAt)[0];
  if (pick !== undefined) return { kind: 'controls', source: pick.source, track: pick.track, canSeek: pick.track.durationMs !== null };
  const here = new Set(musicAppsFor(os).map((app) => app.id));
  return { kind: 'open', apps: OPEN_BUTTONS.filter((id) => here.has(id)), askAccess: os === 'android' && androidAccess === false };
}

/** The VoiceOver / TalkBack line for the song: "Title, by Artist, playing". */
export function trackSpoken(track: Track): string {
  return [track.title, track.artist === null ? null : `by ${track.artist}`, track.playing ? 'playing' : 'paused']
    .filter((part) => part !== null)
    .join(', ');
}
