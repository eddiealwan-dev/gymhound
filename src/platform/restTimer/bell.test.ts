import type { BellSound } from '../../domain/types';

// expo-audio is native. These tests drive the bell against a stand-in player and read the calls it makes.
const mockPlayers: { source: unknown; seekTo: jest.Mock; play: jest.Mock }[] = [];
const mockAudio = {
  setAudioModeAsync: jest.fn(),
  createAudioPlayer: jest.fn((source: unknown) => {
    const player = { source, seekTo: jest.fn(() => Promise.resolve()), play: jest.fn() };
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
function load(): (sound: BellSound) => Promise<void> {
  let playBell!: (sound: BellSound) => Promise<void>;
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

  it('plays the chosen sound from the start, each sound its own file', async () => {
    const playBell = load();

    await playBell('bell');
    await playBell('chime');
    await playBell('ding');

    expect(mockPlayers.map((p) => p.source)).toEqual(['bell.wav', 'chime.wav', 'ding.wav']);
    mockPlayers.forEach((p) => {
      expect(p.seekTo).toHaveBeenCalledWith(0);
      expect(p.play).toHaveBeenCalledTimes(1);
      expect(p.seekTo.mock.invocationCallOrder[0]).toBeLessThan(p.play.mock.invocationCallOrder[0]);
    });
  });

  it('sets the audio mode once and keeps a sound\'s player, winding it back for the next ring', async () => {
    const playBell = load();

    await playBell('bell');
    await playBell('bell');

    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(mockAudio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayers[0].seekTo).toHaveBeenCalledTimes(2);
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(2);
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
