// Writes the three rest-timer bells to assets/sounds/: bell.wav, chime.wav and ding.wav.
// Plain Node with no dependencies. Run it from the project root:  node scripts/make-bells.mjs
//
// Each file is 16-bit PCM, mono, 44.1 kHz. The loudest sample sits at -1 dBFS, so nothing clips, and the sound
// decays to silence: the envelope falls E_FOLDS e-folds over the file (about -78 dB), and a 5 ms attack keeps the start
// from clicking.
//
// The owner found the bell too quiet over a gym, and raising the peak alone gains under 3 dB. So the summed tone goes
// through a gentle tanh saturation (DRIVE) before it is scaled to the peak: the loud start is rounded off, the ring
// holds its level for longer, and the odd harmonics it adds land in the 2-4 kHz band the ear hears best. That puts
// each file's RMS level 7 to 8 dB above the earlier, unsaturated ones. tanh is smooth and odd, so it adds no clicks
// and keeps every zero crossing (and so every pitch). The saturation also lifts the quiet tail, so a raised-cosine
// fade over the last RELEASE_S seconds takes it smoothly to exactly zero.
//
// The owner then asked for each level to be a little louder again (Task 28). A plain slower decay leaves the tail too
// loud at the end of the file, so the decay is curved instead: the envelope is exp(-E_FOLDS * (t / length) ^ CURVE),
// which holds the ring near full level for longer and then falls faster, reaching the same -78 dB at the end. The
// chime's three notes overlap, and where they stack, a rare moment when all three peak together sets the scale for the
// whole file. So where more than one note's worth of envelope sounds at once, the chord is levelled: divided by the
// summed envelope raised to CHORD_LEVEL. That is a slow gain change, so it adds no harmonics. The bell and the ding are
// single notes and never reach it. Together these put each file 2.8 to 3.3 dB above the Task 26 files, with DRIVE
// unchanged.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const PEAK_DBFS = -1;
const PEAK = Math.round(32767 * 10 ** (PEAK_DBFS / 20));
const E_FOLDS = 9;
const CURVE = 1.7;
const CHORD_LEVEL = 0.8;
const ATTACK_S = 0.005;
const RELEASE_S = 0.1;
const DRIVE = 3;

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
  /** A note's envelope `since` seconds after it starts: the 5 ms attack, then the curved decay. */
  const envelope = (since) => Math.min(1, since / ATTACK_S) * Math.exp(-E_FOLDS * (since / seconds) ** CURVE);
  // A note is the partials that start together, so the bell (two partials) is one note and the chime is three.
  const noteStarts = [...new Set(partials.map(({ start }) => start))];
  const raw = new Float64Array(length);
  let loudest = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    let sum = 0;
    for (const { freq, amp, start } of partials) {
      const since = t - start;
      if (since < 0) continue;
      sum += amp * envelope(since) * Math.sin(2 * Math.PI * freq * since);
    }
    const stacked = noteStarts.reduce((total, start) => (t >= start ? total + envelope(t - start) : total), 0);
    raw[i] = stacked > 1 ? sum / stacked ** CHORD_LEVEL : sum;
    loudest = Math.max(loudest, Math.abs(raw[i]));
  }
  // Saturate the tone normalised to 1, so DRIVE means the same for every sound, then fade the tail out.
  const shaped = new Float64Array(length);
  let shapedLoudest = 0;
  for (let i = 0; i < length; i++) {
    const left = (length - i) / RATE;
    const fade = left >= RELEASE_S ? 1 : 0.5 * (1 - Math.cos((Math.PI * left) / RELEASE_S));
    shaped[i] = Math.tanh((DRIVE * raw[i]) / loudest) * fade;
    shapedLoudest = Math.max(shapedLoudest, Math.abs(shaped[i]));
  }
  const gain = PEAK / shapedLoudest;
  return Int16Array.from(shaped, (v) => Math.round(v * gain));
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
