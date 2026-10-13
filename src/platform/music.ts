import { Linking } from 'react-native';
import type { MusicAppId } from '../domain/types';

/**
 * The apps the session's music button can open (spec §18.2). Expo Go can only open another app by its address;
 * playing and pausing from inside GymHound is the phase 7 player.
 */
export type MusicApp = {
  id: MusicAppId;
  label: string;
  url: string;
  platforms: ('ios' | 'android')[];
};

export const MUSIC_APPS: MusicApp[] = [
  { id: 'apple-music', label: 'Apple Music', url: 'music://', platforms: ['ios'] },
  { id: 'spotify', label: 'Spotify', url: 'spotify://', platforms: ['ios', 'android'] },
  { id: 'audible', label: 'Audible', url: 'audible://', platforms: ['ios', 'android'] },
];

/** The apps that exist on this platform (`Platform.OS`). None on web. */
export function musicAppsFor(os: string): MusicApp[] {
  return MUSIC_APPS.filter((app) => (app.platforms as string[]).includes(os));
}

/** The stored app (Settings `musicApp`), if this platform can have it: never on web, and Apple Music never on Android. */
export function musicAppOn(os: string, id: MusicAppId | null): MusicApp | null {
  return musicAppsFor(os).find((app) => app.id === id) ?? null;
}

/** Opens the app. A refusal from the phone means it is not installed (or cannot be opened), which is 'missing'. */
export async function openMusicApp(app: MusicApp): Promise<'opened' | 'missing'> {
  try {
    await Linking.openURL(app.url);
    return 'opened';
  } catch {
    return 'missing';
  }
}
