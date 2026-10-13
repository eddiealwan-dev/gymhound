import { Linking } from 'react-native';
import { MUSIC_APPS, musicAppOn, musicAppsFor, openMusicApp } from './music';

const ids = (os: string) => musicAppsFor(os).map((app) => app.id);

describe('musicAppsFor', () => {
  it('lists Apple Music, Spotify and Audible on iOS', () => {
    expect(ids('ios')).toEqual(['apple-music', 'spotify', 'audible']);
  });

  it('lists Spotify and Audible on Android', () => {
    expect(ids('android')).toEqual(['spotify', 'audible']);
  });

  it('lists nothing on web', () => {
    expect(musicAppsFor('web')).toEqual([]);
  });
});

describe('musicAppOn (Task 26: the music bar shows only an app this platform can have)', () => {
  it('finds the stored app on a platform that has it', () => {
    expect(musicAppOn('ios', 'apple-music')?.label).toBe('Apple Music');
    expect(musicAppOn('android', 'spotify')?.label).toBe('Spotify');
  });

  it('finds nothing for no app, Apple Music on Android, or anything on web', () => {
    expect(musicAppOn('ios', null)).toBeNull();
    expect(musicAppOn('android', 'apple-music')).toBeNull();
    expect(musicAppOn('web', 'spotify')).toBeNull();
  });
});

describe('MUSIC_APPS', () => {
  it('opens each app by its own address', () => {
    expect(MUSIC_APPS.map(({ id, label, url }) => ({ id, label, url }))).toEqual([
      { id: 'apple-music', label: 'Apple Music', url: 'music://' },
      { id: 'spotify', label: 'Spotify', url: 'spotify://' },
      { id: 'audible', label: 'Audible', url: 'audible://' },
    ]);
  });
});

describe('openMusicApp', () => {
  const spotify = MUSIC_APPS.find((app) => app.id === 'spotify')!;

  afterEach(() => jest.restoreAllMocks());

  it("says 'opened' when the app opens", async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await expect(openMusicApp(spotify)).resolves.toBe('opened');
    expect(openURL).toHaveBeenCalledWith('spotify://');
  });

  it("says 'missing' when the phone cannot open it", async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No app handles spotify://'));
    await expect(openMusicApp(spotify)).resolves.toBe('missing');
  });
});
