/** @jest-environment node */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { CATALOG_NEW, PHOTO_ALIAS, RUNG_NEW } from './newExerciseData';
import { WEB_PHOTO_ALIASES, WEB_PHOTOS } from './webPhotos.generated';

const ROOT = join(__dirname, '..', '..');
const manifest: Record<string, { title?: string; alias?: string; note?: string; position?: string }> = JSON.parse(
  readFileSync(join(ROOT, 'scripts', 'web-photos.json'), 'utf8'),
);
const libraryIds: string[] = JSON.parse(readFileSync(join(ROOT, 'src', 'seed', 'libraryIds.json'), 'utf8'));
const libraryPhoto = (id: string) => existsSync(join(ROOT, 'assets', 'exercises', `${id}-0.webp`));
const BUNDLABLE = /^(Public domain|CC0|CC BY(-SA)?( \d(\.\d)?)?( [a-z]{2})?)$/i;

describe('the Commons photos (Round 16c): scripts/web-photos.json, built by scripts/build-web-photos.mjs', () => {
  it('the generated map is in step with the manifest: one photo or one alias per listed exercise', () => {
    const photos = Object.entries(manifest).filter(([, e]) => e.title !== undefined).map(([id]) => id);
    const aliases = Object.entries(manifest).filter(([, e]) => e.alias !== undefined).map(([id]) => id);
    expect(Object.keys(WEB_PHOTOS).sort()).toEqual(photos.sort());
    expect(Object.keys(WEB_PHOTO_ALIASES).sort()).toEqual(aliases.sort());
    for (const id of aliases) expect([id, WEB_PHOTO_ALIASES[id]]).toEqual([id, { photosOf: manifest[id].alias, note: manifest[id].note }]);
  });

  it('every listed exercise is a library exercise with no free-exercise-db photos, and not one the seed already aliases', () => {
    for (const id of Object.keys(manifest)) {
      expect([id, libraryIds.includes(id)]).toEqual([id, true]);
      expect([id, libraryPhoto(id)]).toEqual([id, false]);
      expect([id, id in PHOTO_ALIAS]).toEqual([id, false]);
    }
  });

  it('every photo is a 360 x 240 WebP in assets/exercises-web, under a licence the app can bundle, with a credit', async () => {
    for (const [id, p] of Object.entries(WEB_PHOTOS)) {
      const file = join(ROOT, 'assets', 'exercises-web', `${id}.webp`);
      expect([id, existsSync(file)]).toEqual([id, true]);
      const meta = await sharp(file).metadata();
      expect([id, meta.width, meta.height, meta.format]).toEqual([id, 360, 240, 'webp']);
      expect([id, p.license]).toEqual([id, expect.stringMatching(BUNDLABLE)]);
      expect(p.author.length).toBeGreaterThan(0);
      expect(p.page).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      if (p.note !== null) expect([id, p.note]).toEqual([id, expect.stringMatching(/^[^!]+\.$/)]);
    }
  });

  it('an alias points one hop at an exercise with photos of its own, and says what is shown', () => {
    for (const [id, a] of Object.entries(WEB_PHOTO_ALIASES)) {
      expect([id, a.photosOf in WEB_PHOTOS || libraryPhoto(a.photosOf)]).toEqual([id, true]);
      expect([id, a.photosOf in WEB_PHOTO_ALIASES]).toEqual([id, false]);
      expect([id, a.note]).toEqual([id, expect.stringMatching(/^[^!]+\.$/)]);
      expect(a.note).not.toMatch(/’/);
    }
  });

  it('the metcons have no photo: each is several moves', () => {
    for (const e of [...CATALOG_NEW, ...RUNG_NEW]) if (e.id.startsWith('metcon-')) expect([e.id, e.id in manifest]).toEqual([e.id, false]);
  });

  it('docs/photo-credits.md names every photo', () => {
    const credits = readFileSync(join(ROOT, 'docs', 'photo-credits.md'), 'utf8');
    for (const [id, p] of Object.entries(WEB_PHOTOS)) {
      expect(credits).toContain(`**${id}**`);
      expect(credits).toContain(p.page);
    }
  });
});
