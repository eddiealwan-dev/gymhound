// Writes the three rest-timer bells to assets/sounds/: bell.wav, chime.wav and ding.wav.
// Plain Node with no dependencies. Run it from the project root:  node scripts/make-bells.mjs
//
// Each file is 16-bit PCM, mono, 44.1 kHz. The loudest sample sits at -3 dBFS, so nothing clips, and the sound
// decays exponentially to silence: the envelope falls E_FOLDS e-folds over the file (about -78 dB), a 10 ms fade
// takes the last few samples to exactly zero, and a 3 ms attack keeps the start from clicking.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const PEAK_DBFS = -3;
const PEAK = Math.round(32767 * 10 ** (PEAK_DBFS / 20));
const E_FOLDS = 9;
const ATTACK_S = 0.003;
const RELEASE_S = 0.01;

/** The three sounds. A partial is a sine at `freq` Hz, `amp` loud relative to the others, starting `start` seconds in. */
const SOUNDS = {
  // 880 Hz with a 2,640 Hz partial (the third harmonic) at a third of the amplitude.
  bell: {
    seconds: 1.0,
    partials: [
      { freq: 880, amp: 1, start: 0 },
      { freq: 2640, amp: 1 / 3, start: 0 },
    ],
  },
  // 1,047, 1,319 and 1,568 Hz (C6, E6, G6), each starting 80 ms after the one before.
  chime: {
    seconds: 1.1,
    partials: [
      { freq: 1047, amp: 1, start: 0 },
      { freq: 1319, amp: 1, start: 0.08 },
      { freq: 1568, amp: 1, start: 0.16 },
    ],
  },
  // A single 1,320 Hz tone.
  ding: {
    seconds: 0.5,
    partials: [{ freq: 1320, amp: 1, start: 0 }],
  },
};

/** The samples for a sound, as 16-bit integers scaled so the loudest is exactly PEAK. */
function synthesize({ seconds, partials }) {
  const length = Math.round(seconds * RATE);
  const tau = seconds / E_FOLDS;
  const raw = new Float64Array(length);
  let loudest = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    let sum = 0;
    for (const { freq, amp, start } of partials) {
      const since = t - start;
      if (since < 0) continue;
      sum += amp * Math.min(1, since / ATTACK_S) * Math.exp(-since / tau) * Math.sin(2 * Math.PI * freq * since);
    }
    raw[i] = sum * Math.min(1, (seconds - t) / RELEASE_S);
    loudest = Math.max(loudest, Math.abs(raw[i]));
  }
  const gain = PEAK / loudest;
  return Int16Array.from(raw, (v) => Math.round(v * gain));
}

/** A RIFF/WAVE file holding the samples: a 44-byte header, then the little-endian 16-bit PCM data. */
function toWav(samples) {
  const dataBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16); // size of the fmt chunk
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 2, 28); // bytes per second
  wav.writeUInt16LE(2, 32); // bytes per frame
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, i) => wav.writeInt16LE(sample, 44 + i * 2));
  return wav;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
mkdirSync(outDir, { recursive: true });
for (const [name, sound] of Object.entries(SOUNDS)) {
  const file = join(outDir, `${name}.wav`);
  writeFileSync(file, toWav(synthesize(sound)));
  console.log(`wrote ${file}`);
}
