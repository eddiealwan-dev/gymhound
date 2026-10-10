/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';

/** The committed bells (made by scripts/make-bells.mjs) against what the brief asks of them. */

const SOUNDS = join(__dirname, '..', '..', '..', 'assets', 'sounds');
const RATE = 44100;

/**
 * `quietest` is the lowest RMS level (dBFS) over the whole file that passes: the files before Task 26 sat at -17.5 (bell),
 * -17.7 (chime) and -18.4 (ding), and the owner asked for louder, so each must be at least 6 dB above its old level.
 */
const FILES = [
  { name: 'bell', seconds: 1.0, quietest: -17.49 + 6 },
  { name: 'chime', seconds: 1.1, quietest: -17.69 + 6 },
  { name: 'ding', seconds: 0.5, quietest: -18.37 + 6 },
] as const;

function read(name: string) {
  const file = readFileSync(join(SOUNDS, `${name}.wav`));
  const samples = new Int16Array(file.length > 44 ? (file.length - 44) / 2 : 0);
  samples.forEach((_, i) => (samples[i] = file.readInt16LE(44 + i * 2)));
  return { file, samples };
}

/** Root-mean-square of `samples` from `from` to `to` (seconds). */
function rms(samples: Int16Array, from: number, to: number): number {
  const part = samples.slice(Math.round(from * RATE), Math.round(to * RATE));
  return Math.sqrt(part.reduce((sum, s) => sum + s * s, 0) / part.length);
}

describe.each(FILES)('assets/sounds/$name.wav', ({ name, seconds, quietest }) => {
  const { file, samples } = read(name);

  it('is a 16-bit PCM, mono, 44.1 kHz WAV with a consistent header', () => {
    expect(file.toString('ascii', 0, 4)).toBe('RIFF');
    expect(file.readUInt32LE(4)).toBe(file.length - 8);
    expect(file.toString('ascii', 8, 12)).toBe('WAVE');
    expect(file.toString('ascii', 12, 16)).toBe('fmt ');
    expect(file.readUInt32LE(16)).toBe(16);
    expect(file.readUInt16LE(20)).toBe(1); // PCM
    expect(file.readUInt16LE(22)).toBe(1); // mono
    expect(file.readUInt32LE(24)).toBe(RATE);
    expect(file.readUInt32LE(28)).toBe(RATE * 2); // bytes per second
    expect(file.readUInt16LE(32)).toBe(2); // bytes per frame
    expect(file.readUInt16LE(34)).toBe(16);
    expect(file.toString('ascii', 36, 40)).toBe('data');
    expect(file.readUInt32LE(40)).toBe(file.length - 44);
  });

  it(`lasts ${seconds} s`, () => {
    expect(samples.length / RATE).toBeCloseTo(seconds, 4);
  });

  it('peaks at -1 dBFS and never clips', () => {
    const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    expect(20 * Math.log10(peak / 32767)).toBeCloseTo(-1, 2);
    expect(peak).toBeLessThan(32767);
  });

  it('is at least 6 dB louder (RMS) than before Task 26 (owner: the bell needs to be louder)', () => {
    expect(20 * Math.log10(rms(samples, 0, seconds) / 32767)).toBeGreaterThanOrEqual(quietest);
  });

  it('starts and ends in silence', () => {
    expect(samples[0]).toBe(0);
    expect(Array.from(samples.slice(-8))).toEqual(new Array(8).fill(0));
  });

  it('decays away: each 100 ms is quieter than the one before, and the last 20 ms is under -60 dB', () => {
    const windows: number[] = [];
    // The chime's last note starts at 160 ms, so start counting after that.
    for (let from = 0.2; from + 0.1 <= seconds + 1e-9; from += 0.1) windows.push(rms(samples, from, from + 0.1));
    windows.forEach((w, i) => i > 0 && expect(w).toBeLessThan(windows[i - 1]));
    const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    const tail = samples.slice(-Math.round(0.02 * RATE)).reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    expect(tail).toBeLessThan(peak * 0.001);
  });
});

describe('the pitches', () => {
  /** Zero crossings per second in the first `window` seconds, counting upward crossings only: the pitch of a lone tone. */
  function hz(samples: Int16Array, from: number, to: number): number {
    let crossings = 0;
    for (let i = Math.round(from * RATE) + 1; i < Math.round(to * RATE); i++) {
      if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
    }
    return crossings / (to - from);
  }

  it('the ding is a 1,320 Hz tone', () => {
    expect(hz(read('ding').samples, 0.01, 0.2)).toBeCloseTo(1320, -1);
  });

  it('the chime starts with its lowest note alone, 1,047 Hz, before the others come in', () => {
    expect(hz(read('chime').samples, 0.01, 0.07)).toBeCloseTo(1047, -2);
  });
});
