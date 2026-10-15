/** @jest-environment node */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PROGRAMS } from './programs.generated';
import { PROGRAM_PICTURES, PROGRAM_PICTURE_SOURCES } from './programPictures.generated';

const ROOT = join(__dirname, '..', '..');

/** The twenty program ids, `program-{json id}` (R598), in program number order. */
const IDS = [
  'program-barbell-foundations',
  'program-dumbbell-full-body',
  'program-calisthenics-foundations',
  'program-minimalist-two-day',
  'program-upper-lower-powerbuilding',
  'program-push-pull-legs',
  'program-full-body-three-day',
  'program-kettlebell-strength-conditioning',
  'program-lean-out',
  'program-glute-lower-body-emphasis',
  'program-advanced-upper-lower-dup',
  'program-strength-peaking-block',
  'program-dumbbell-full-body-ii',
  'program-mobility-for-lifters',
  'program-bro-split',
  'program-advanced-calisthenics',
  'program-crossfit-foundations',
  'program-crossfit-performance',
  'program-strongman-prep',
  'program-hybrid-athlete',
];

const asset = (id: string, kind: 'card' | 'thumb') => join(ROOT, 'assets', 'programs', `${id}-${kind}.webp`);

describe('program card pictures (R632)', () => {
  it('20 card and 20 thumb assets, one per program id', async () => {
    expect(IDS).toHaveLength(20);
    for (const id of IDS) {
      expect(existsSync(asset(id, 'card'))).toBe(true);
      expect(existsSync(asset(id, 'thumb'))).toBe(true);
      const card = await sharp(asset(id, 'card')).metadata();
      const thumb = await sharp(asset(id, 'thumb')).metadata();
      expect([card.format, card.width, card.height]).toEqual(['webp', 360, 240]);
      expect([thumb.format, thumb.width, thumb.height]).toEqual(['webp', 144, 144]);
    }
  });

  it('pictures are distinct source photos', () => {
    const sources = IDS.map((id) => PROGRAM_PICTURE_SOURCES[id]);
    for (const s of sources) {
      expect(s).toBeDefined();
      expect([0, 1]).toContain(s.frame);
      expect(existsSync(join(ROOT, 'assets', 'exercises', `${s.exerciseId}-${s.frame}.webp`))).toBe(true);
    }
    expect(new Set(sources.map((s) => s.exerciseId)).size).toBe(20);
    expect(new Set(sources.map((s) => `${s.exerciseId}-${s.frame}`)).size).toBe(20);
  });

  it('the generated map\'s keys equal PROGRAM ids', () => {
    expect(Object.keys(PROGRAM_PICTURES).sort()).toEqual([...IDS].sort());
    expect(Object.keys(PROGRAM_PICTURE_SOURCES).sort()).toEqual([...IDS].sort());
    // PROGRAMS is filled by the program build (Task 2); once it is, it must list the same ids.
    if (PROGRAMS.length > 0) expect(PROGRAMS.map((p) => p.id).sort()).toEqual([...IDS].sort());
  });

  it('every picture is grayscale, so the set reads as a series', async () => {
    for (const id of IDS) {
      for (const kind of ['card', 'thumb'] as const) {
        const { channels } = await sharp(asset(id, kind)).removeAlpha().stats();
        expect(Math.abs(channels[0].mean - channels[1].mean)).toBeLessThan(1);
        expect(Math.abs(channels[1].mean - channels[2].mean)).toBeLessThan(1);
      }
    }
  });
});
