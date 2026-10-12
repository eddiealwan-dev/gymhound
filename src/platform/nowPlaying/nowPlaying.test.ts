import {
  createNativePlayer,
  loadNowPlaying,
  musicBarMode,
  NOW_PLAYING_MODULE,
  positionNow,
  SEEK_STEP_MS,
  seekTarget,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_REMOTE_MODULE,
  toTrack,
  trackSpoken,
  type NowPlayingModuleLike,
  type SpotifyRemoteModuleLike,
  type Track,
} from '.';
import { sourcesFor } from './rules';

const song = (over: Partial<Track> = {}): Track => ({
  title: 'Run the Jewels',
  artist: 'Killer Mike',
  playing: true,
  positionMs: 60_000,
  durationMs: 200_000,
  readAt: 1_000,
  ...over,
});

describe('the song position and the 15-second skips (§17.3)', () => {
  it('runs a playing song on from its reading, up to its end; a paused one stays put', () => {
    expect(positionNow(song(), 6_000)).toBe(65_000);
    expect(positionNow(song({ playing: false }), 6_000)).toBe(60_000);
    expect(positionNow(song(), 1_000_000)).toBe(200_000);
    expect(positionNow(song({ durationMs: null }), 6_000)).toBe(65_000);
  });

  it('skips 15 seconds either way, kept inside the song', () => {
    expect(SEEK_STEP_MS).toBe(15_000);
    expect(seekTarget(song(), 1, 1_000)).toBe(75_000);
    expect(seekTarget(song(), -1, 1_000)).toBe(45_000);
    expect(seekTarget(song({ positionMs: 5_000 }), -1, 1_000)).toBe(0);
    expect(seekTarget(song({ positionMs: 195_000 }), 1, 1_000)).toBe(200_000);
  });

  it('cannot seek a stream with no length', () => {
    expect(seekTarget(song({ durationMs: null }), 1, 1_000)).toBeNull();
  });
});

describe('sourcesFor (R313)', () => {
  it("is Android's media session, and Apple Music on iPhone, with Spotify only once registered", () => {
    expect(sourcesFor('android', true)).toEqual(['media-session']);
    expect(sourcesFor('ios', false)).toEqual(['apple-music']);
    expect(sourcesFor('ios', true)).toEqual(['apple-music', 'spotify']);
    expect(sourcesFor('web', true)).toEqual([]);
  });
});

describe('musicBarMode (§17.3, R314)', () => {
  it('controls a loaded song, playing before paused, then the newest', () => {
    const paused = { source: 'apple-music' as const, track: song({ playing: false, readAt: 9_000 }) };
    const playing = { source: 'spotify' as const, track: song({ readAt: 2_000 }) };
    expect(musicBarMode('ios', [paused, playing])).toMatchObject({ kind: 'controls', source: 'spotify' });
    expect(musicBarMode('ios', [paused, { source: 'spotify', track: null }])).toMatchObject({ kind: 'controls', source: 'apple-music' });
    const older = { source: 'spotify' as const, track: song({ playing: false, readAt: 1_000 }) };
    expect(musicBarMode('ios', [older, paused])).toMatchObject({ source: 'apple-music', canSeek: true });
    expect(musicBarMode('ios', [{ source: 'apple-music', track: song({ durationMs: null }) }])).toMatchObject({ canSeek: false });
  });

  it('offers Apple Music and Spotify on iPhone, Spotify on Android, when nothing is loaded', () => {
    expect(musicBarMode('ios', [])).toEqual({ kind: 'open', apps: ['apple-music', 'spotify'], askAccess: false });
    expect(musicBarMode('android', [{ source: 'media-session', track: null }], true)).toEqual({ kind: 'open', apps: ['spotify'], askAccess: false });
  });

  it("asks for Android's notification access only when it is known to be missing", () => {
    expect(musicBarMode('android', [], false)).toMatchObject({ askAccess: true });
    expect(musicBarMode('android', [], null)).toMatchObject({ askAccess: false });
    expect(musicBarMode('ios', [], false)).toMatchObject({ askAccess: false });
  });

  it('says the song for VoiceOver and TalkBack', () => {
    expect(trackSpoken(song())).toBe('Run the Jewels, by Killer Mike, playing');
    expect(trackSpoken(song({ artist: null, playing: false }))).toBe('Run the Jewels, paused');
  });
});

function fakeModule(over: Partial<SpotifyRemoteModuleLike> = {}): jest.Mocked<SpotifyRemoteModuleLike> {
  return {
    getNowPlaying: jest.fn(async () => ({ title: 'Song', artist: 'Band', isPlaying: true, positionMs: 1_000, durationMs: 3_000 })),
    play: jest.fn(async () => {}),
    pause: jest.fn(async () => {}),
    skipToPrevious: jest.fn(async () => {}),
    skipToNext: jest.fn(async () => {}),
    seekTo: jest.fn(async () => {}),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    connect: jest.fn(async () => true),
    ...over,
  } as unknown as jest.Mocked<SpotifyRemoteModuleLike>;
}

describe('the native player', () => {
  it('reads the song, and treats an empty or failed reading as nothing loaded', async () => {
    expect(toTrack({ title: '', isPlaying: true, positionMs: 0 }, 5)).toBeNull();
    expect(toTrack({ title: 'Live', isPlaying: false, positionMs: -4, durationMs: 0 }, 5)).toEqual({
      title: 'Live',
      artist: null,
      playing: false,
      positionMs: 0,
      durationMs: null,
      readAt: 5,
    });
    const module = fakeModule();
    const player = createNativePlayer('apple-music', module, () => 7);
    await expect(player.read()).resolves.toEqual({ title: 'Song', artist: 'Band', playing: true, positionMs: 1_000, durationMs: 3_000, readAt: 7 });
    module.getNowPlaying.mockRejectedValueOnce(new Error('denied'));
    await expect(player.read()).resolves.toBeNull();
  });

  it('passes the controls through and unsubscribes', async () => {
    const remove = jest.fn();
    const module = fakeModule({ addListener: jest.fn(() => ({ remove })) });
    const player = createNativePlayer('media-session', module);
    await player.play();
    await player.pause();
    await player.previous();
    await player.next();
    await player.seekTo(1234.6);
    expect(module.play).toHaveBeenCalled();
    expect(module.pause).toHaveBeenCalled();
    expect(module.skipToPrevious).toHaveBeenCalled();
    expect(module.skipToNext).toHaveBeenCalled();
    expect(module.seekTo).toHaveBeenCalledWith(1235);
    const off = player.onChange(() => {});
    off();
    expect(remove).toHaveBeenCalled();
  });
});

describe('loadNowPlaying (R313, R315)', () => {
  const IOS = { os: 'ios', expoGo: false };
  const ANDROID = { os: 'android', expoGo: false };

  it('has no player in Expo Go, on the web, or before the modules exist', () => {
    const requireModule = jest.fn(() => null);
    expect(loadNowPlaying({ os: 'ios', expoGo: true }, requireModule, 'id')).toEqual({ players: [], access: null });
    expect(loadNowPlaying({ os: 'web', expoGo: false }, requireModule, 'id')).toEqual({ players: [], access: null });
    expect(requireModule).not.toHaveBeenCalled();
    expect(loadNowPlaying(IOS, requireModule, 'id')).toEqual({ players: [], access: null });
  });

  it('adds Spotify on iPhone only with its module and a client id, connecting on the first read', async () => {
    const system = fakeModule();
    const remote = fakeModule();
    const requireModule = (<T,>(name: string) => (name === NOW_PLAYING_MODULE ? system : name === SPOTIFY_REMOTE_MODULE ? remote : null) as T | null);
    expect(loadNowPlaying(IOS, requireModule, undefined).players.map((p) => p.source)).toEqual(['apple-music']);
    expect(loadNowPlaying(IOS, requireModule, '  ').players.map((p) => p.source)).toEqual(['apple-music']);
    const { players } = loadNowPlaying(IOS, requireModule, 'client-1');
    expect(players.map((p) => p.source)).toEqual(['apple-music', 'spotify']);
    remote.connect.mockResolvedValueOnce(false);
    await expect(players[1].read()).resolves.toBeNull();
    await expect(players[1].read()).resolves.not.toBeNull();
    await players[1].read();
    expect(remote.connect).toHaveBeenCalledTimes(2);
    expect(remote.connect).toHaveBeenCalledWith('client-1', SPOTIFY_REDIRECT_URI);
  });

  it("gives Android's media session and its notification access", async () => {
    const system = fakeModule({ hasNotificationAccess: jest.fn(async () => false), openNotificationAccessSettings: jest.fn(async () => {}) });
    const { players, access } = loadNowPlaying(ANDROID, <T,>() => system as T, undefined);
    expect(players.map((p) => p.source)).toEqual(['media-session']);
    await expect(access?.granted()).resolves.toBe(false);
    await access?.openSettings();
    expect(system.openNotificationAccessSettings).toHaveBeenCalled();
  });
});
