import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { BellSound } from '../../domain/types';

/** The bundled bells (scripts/make-bells.mjs). Metro turns each into an asset id; on web, a URL. */
const SOURCES: Record<BellSound, number> = {
  bell: require('../../../assets/sounds/bell.wav'),
  chime: require('../../../assets/sounds/chime.wav'),
  ding: require('../../../assets/sounds/ding.wav'),
};

let modeSet: Promise<void> | null = null;

/**
 * The audio mode for the bell, set once:
 * - `playsInSilentMode`: it rings even with the ringer switch on silent (owner decision).
 * - `duckOthers`: music keeps playing, quieter, for as long as the bell sounds, and is never stopped. The audio session
 *   ends with the bell, which lets the music come back up.
 * A failure is not remembered, so the next bell tries again.
 */
function audioModeReady(): Promise<void> {
  modeSet ??= setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch((e) => {
    modeSet = null;
    throw e;
  });
  return modeSet;
}

/** One player per sound, made the first time it is needed and kept: the files are small, and a kept player rings at once. */
const players = new Map<BellSound, AudioPlayer>();

function playerFor(sound: BellSound): AudioPlayer {
  let player = players.get(sound);
  if (!player) {
    player = createAudioPlayer(SOURCES[sound]);
    players.set(sound, player);
  }
  return player;
}

/**
 * Plays the bell once, over any music, which it only ducks. It never throws: a bell that cannot play (no audio on this
 * device, or on web before the page has had a tap) is logged and the rest timer carries on without it.
 */
export async function playBell(sound: BellSound): Promise<void> {
  try {
    await audioModeReady();
    const player = playerFor(sound);
    // A bell that has played to its end sits at its end until it is wound back.
    await player.seekTo(0);
    player.play();
  } catch (e) {
    console.warn('GymHound: the bell could not play.', e);
  }
}
