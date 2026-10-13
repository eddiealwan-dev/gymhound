import type { BellSound } from '../../domain/types';

// expo-audio is native. These tests drive the bell against a stand-in player and read the calls it makes.
// A player starts at 0 seconds and has no item ready yet; a test sets `currentTime` to say it has played.
// `playedAt` records the player's volume each time it is played.
const mockPlayers: { source: unknown; currentTime: number; volume: number; playedAt: number[]; seekTo: jest.Mock; play: jest.Mock }[] = [];
const mockAudio = {
  setAudioModeAsync: jest.fn(),
  createAudioPlayer: jest.fn((source: unknown) => {
    const player = {
      source,
      currentTime: 0,
      volume: 1,
      playedAt: [] as number[],
      seekTo: jest.fn(() => Promise.resolve()),
      play: jest.fn(() => void player.playedAt.push(player.volume)),
    };
    mockPlayers.push(player);
    return player;
  }),
};
jest.mock('expo-audio', () => mockAudio);
// Jest turns every asset into the number 1, so give each bell its own name to tell them apart.
jest.mock('../../../assets/sounds/bell.wav', () => 'bell.wav');
jest.mock('../../../assets/sounds/chime.wav', () => 'chime.wav');
jest.mock('../../../assets/sounds/ding.wav', () => 'ding.wav');

/** A fresh copy of the module: it keeps the audio mode and the players between calls. */
function load(): (sound: BellSound, volume?: number) => Promise<void> {
  let playBell!: (sound: BellSound, volume?: number) => Promise<void>;
  jest.isolateModules(() => {
    playBell = (require('./bell') as typeof import('./bell')).playBell;
  });
  return playBell;
}

beforeEach(() => {
  mockPlayers.length = 0;
  mockAudio.setAudioModeAsync.mockReset().mockResolvedValue(undefined);
  mockAudio.createAudioPlayer.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('playBell (Task 15 Step 4)', () => {
  it('plays over the silent switch and ducks other audio, never stopping it', async () => {
    const playBell = load();

    await playBell('bell');

    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  });

  it('sets the audio mode before the sound plays', async () => {
    const playBell = load();

    await playBell('bell');

    expect(mockAudio.setAudioModeAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockAudio.createAudioPlayer.mock.invocationCallOrder[0],
    );
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  });

  it('plays the chosen sound, each sound its own file', async () => {
    const playBell = load();

    await playBell('bell');
    await playBell('chime');
    await playBell('ding');

    expect(mockPlayers.map((p) => p.source)).toEqual(['bell.wav', 'chime.wav', 'ding.wav']);
    mockPlayers.forEach((p) => expect(p.play).toHaveBeenCalledTimes(1));
  });

  it('plays a fresh player without any seek: its item may not be ready, and iOS cannot seek one that is not', async () => {
    const playBell = load();

    await playBell('bell');

    expect(mockPlayers[0].seekTo).not.toHaveBeenCalled();
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  });

  it('sets the audio mode once and keeps a sound\'s player, winding back one that has played before the next ring', async () => {
    const playBell = load();

    await playBell('bell');
    mockPlayers[0].currentTime = 1; // it played to its end
    await playBell('bell');

    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(mockAudio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayers[0].seekTo).toHaveBeenCalledTimes(1);
    expect(mockPlayers[0].seekTo).toHaveBeenCalledWith(0);
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(2);
    expect(mockPlayers[0].seekTo.mock.invocationCallOrder[0]).toBeLessThan(mockPlayers[0].play.mock.invocationCallOrder[1]);
  });

  it('does not seek a player that has not played yet, even when it is rung again at once', async () => {
    const playBell = load();

    await playBell('bell');
    await playBell('bell'); // still at 0: nothing has played, so there is nothing to wind back

    expect(mockPlayers[0].seekTo).not.toHaveBeenCalled();
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(2);
  });

  it('plays at the volume it is given (Settings → Bell volume, Task 26), set before it plays', async () => {
    const playBell = load();

    await playBell('bell', 0.5);

    expect(mockPlayers[0].volume).toBe(0.5);
    expect(mockPlayers[0].playedAt).toEqual([0.5]);
  });

  it('plays at full volume when none is given', async () => {
    const playBell = load();

    await playBell('chime');

    expect(mockPlayers[0].playedAt).toEqual([1]);
  });

  it('sets the kept player to the new volume on each ring', async () => {
    const playBell = load();

    await playBell('ding', 0.25);
    await playBell('ding', 0.75);

    expect(mockAudio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayers[0].playedAt).toEqual([0.25, 0.75]);
  });

  it('logs and swallows a bell that cannot play', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAudio.createAudioPlayer.mockImplementationOnce(() => {
      throw new Error('no audio output');
    });
    const playBell = load();

    await expect(playBell('bell')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows a failure to set the audio mode, and tries again the next time', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAudio.setAudioModeAsync.mockRejectedValueOnce(new Error('audio session busy'));
    const playBell = load();

    await expect(playBell('bell')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(mockPlayers).toHaveLength(0);

    await playBell('bell');
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledTimes(2);
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows a seek or play that throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const playBell = load();
    await playBell('ding');
    mockPlayers[0].play.mockImplementationOnce(() => {
      throw new Error('player was released');
    });

    await expect(playBell('ding')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
