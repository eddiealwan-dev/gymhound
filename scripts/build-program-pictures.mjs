// Builds the program card pictures: spec §18.29, R632 and Appendix E. Run it from the project root:
//   npm run build:pictures
//
// Each of the twenty programs shows one bundled free-exercise-db photo (the Unlicense) of its signature movement,
// from assets/exercises/{exerciseId}-{frame}.webp. The script writes the only copies of:
//   assets/programs/{programId}-card.webp   360 x 240, the whole 3:2 frame
//   assets/programs/{programId}-thumb.webp  144 x 144, a square crop centred on the lifter (the Routines row)
//   src/seed/programPictures.generated.ts   the pictures as static require() calls, and each one's source
// The treatment is one for all of them, so photos shot against different walls (some red) read as a series, and red
// stays for the wordmark, the active tab and the PR marks: grayscale and a slight contrast lift, WebP quality 80.
// Nothing is enlarged: every source is a landscape photo at least 360 x 240.
// Never edit the generated files by hand.
//
// PICTURES (by program number): the movement and the frame (0 = start, 1 = end of the rep) chosen for each program, by looking at both
// frames of each candidate: the one that shows the working position (the bottom of a squat, the bar at the chest,
// the lockout) most clearly. If src/seed/programMapping.ts exists and exports PICTURES, the script reads that
// instead of this copy (shape: number -> { exerciseId, frame, label }); keep the two in step (Task 13 checks).

import { existsSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = join(ROOT, 'assets', 'exercises');
const OUT = join(ROOT, 'assets', 'programs');
const TS_OUT = join(ROOT, 'src', 'seed', 'programPictures.generated.ts');
const MAPPING = join(ROOT, 'src', 'seed', 'programMapping.ts');

const CARD = { width: 360, height: 240 };
const THUMB = 144;
const QUALITY = 80;
/** Slight contrast lift on the grayscale: out = in * 1.08 - 6. */
const CONTRAST = { a: 1.08, b: -6 };

/** Program number (1-20) to `program-{json id}` (R598). */
const PROGRAM_IDS = [
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

/** Appendix E, keyed by program number: the movement (label, for VoiceOver "{label} photo"), its source exercise and frame. */
const OWN_PICTURES = {
  1: { exerciseId: 'barbell-back-squat', frame: 1, label: 'Barbell back squat' }, // the bottom
  2: { exerciseId: 'dumbbell-goblet-squat', frame: 1, label: 'Goblet squat' }, // the bottom
  3: { exerciseId: 'pull-up', frame: 1, label: 'Pull-up' }, // chin over the bar
  4: { exerciseId: 'barbell-overhead-press', frame: 1, label: 'Overhead press' }, // the lockout
  5: { exerciseId: 'barbell-row', frame: 0, label: 'Barbell row' }, // bent over, the pull
  6: { exerciseId: 'barbell-front-squat', frame: 1, label: 'Front squat' }, // the bottom
  7: { exerciseId: 'barbell-romanian-deadlift', frame: 0, label: 'Romanian deadlift' }, // the hinge
  8: { exerciseId: 'fedb-one-arm-kettlebell-swings', frame: 1, label: 'Kettlebell swing' }, // the one-arm swing's photo
  9: { exerciseId: 'fedb-rowing-stationary', frame: 1, label: 'Rowing machine' }, // the finish
  10: { exerciseId: 'barbell-hip-thrust', frame: 1, label: 'Hip thrust' }, // the top
  11: { exerciseId: 'barbell-bench-press', frame: 1, label: 'Bench press' }, // bar at the chest
  12: { exerciseId: 'barbell-deadlift', frame: 1, label: 'Deadlift' }, // the lockout
  13: { exerciseId: 'dumbbell-one-arm-row', frame: 1, label: 'One-arm dumbbell row' }, // the pull; landscape, so nothing is enlarged
  14: { exerciseId: 'fedb-kneeling-hip-flexor', frame: 1, label: 'Kneeling hip flexor stretch' }, // closest to the couch stretch
  15: { exerciseId: 'barbell-curl', frame: 1, label: 'Barbell curl' }, // the top
  16: { exerciseId: 'fedb-muscle-up', frame: 1, label: 'Muscle-up' }, // through the rings
  17: { exerciseId: 'fedb-push-press', frame: 1, label: 'Push press' }, // the dip
  18: { exerciseId: 'fedb-snatch', frame: 0, label: 'Snatch' }, // the bottom, wide grip
  19: { exerciseId: 'fedb-atlas-stones', frame: 1, label: 'Atlas stones' }, // stone to the chest
  20: { exerciseId: 'fedb-running-treadmill', frame: 1, label: 'Running on a treadmill' }, // side on
};

/** Where 'attention' misses the lifter (a plate or a machine draws it), the square crop to use instead, in source px. */
const THUMB_CROP = {
  'barbell-hip-thrust': { left: 150, top: 10, size: 210 },
  'fedb-rowing-stationary': { left: 120, top: 0, size: 240 },
};

/** Program id to { exerciseId, frame }, from programMapping.ts's PICTURES (keyed by program number) or the copy above. */
async function loadPictures() {
  let byNumber = OWN_PICTURES;
  if (existsSync(MAPPING)) {
    const mod = await import(pathToFileURL(MAPPING).href);
    if (mod.PICTURES) byNumber = mod.PICTURES;
  }
  const numbers = Object.keys(byNumber).map(Number);
  if (numbers.length !== PROGRAM_IDS.length || !PROGRAM_IDS.every((_, i) => byNumber[i + 1])) {
    throw new Error('PICTURES must have one entry for each program number, 1 to 20');
  }
  return Object.fromEntries(PROGRAM_IDS.map((id, i) => [id, byNumber[i + 1]]));
}

const treat = (pipeline) => pipeline.grayscale().linear(CONTRAST.a, CONTRAST.b);
const webp = (pipeline, file) => pipeline.webp({ quality: QUALITY, effort: 6 }).toFile(file);

async function buildOne(programId, { exerciseId, frame }) {
  const source = join(PHOTOS, `${exerciseId}-${frame}.webp`);
  if (!existsSync(source)) throw new Error(`${programId}: no photo ${exerciseId}-${frame}.webp in assets/exercises`);
  const meta = await sharp(source).metadata();

  // Card: the whole 3:2 frame (a 1 px trim if the source is 241 tall). Every source is landscape, so nothing is enlarged.
  if (meta.width < CARD.width || meta.height < CARD.height) {
    throw new Error(`${programId}: ${exerciseId} is ${meta.width}x${meta.height}, smaller than the card; pick another photo`);
  }
  const card = sharp(source).resize({ width: CARD.width, height: CARD.height, fit: 'cover', position: 'centre', withoutEnlargement: true });
  await webp(treat(card), join(OUT, `${programId}-card.webp`));

  // Thumb: a square crop centred on the lifter, scaled down only.
  const crop = THUMB_CROP[exerciseId];
  const thumb =
    crop === undefined
      ? sharp(source).resize({ width: THUMB, height: THUMB, fit: 'cover', position: 'attention' })
      : sharp(source).extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size }).resize(THUMB, THUMB);
  await webp(treat(thumb), join(OUT, `${programId}-thumb.webp`));
}

function writeTs(pictures) {
  const ids = Object.keys(pictures);
  const pics = ids.map((id) => `  '${id}': { card: require('../../assets/programs/${id}-card.webp'), thumb: require('../../assets/programs/${id}-thumb.webp') },`);
  const sources = ids.map((id) => `  '${id}': { exerciseId: '${pictures[id].exerciseId}', frame: ${pictures[id].frame} },`);
  const text = [
    '// Generated by scripts/build-program-pictures.mjs from bundled free-exercise-db photos (the Unlicense; spec R632).',
    '// Do not edit: change the picture mapping and run `npm run build:pictures`.',
    "import type { ImageSourcePropType } from 'react-native';",
    '',
    '/** Each program’s grayscale card picture (360 × 240) and Routines thumbnail (144 × 144), keyed by program id. */',
    'export const PROGRAM_PICTURES: Readonly<Record<string, { card: ImageSourcePropType; thumb: ImageSourcePropType }>> = {',
    ...pics,
    '};',
    '',
    '/** The photo each picture is made from: assets/exercises/{exerciseId}-{frame}.webp. */',
    'export const PROGRAM_PICTURE_SOURCES: Readonly<Record<string, { exerciseId: string; frame: 0 | 1 }>> = {',
    ...sources,
    '};',
    '',
  ].join('\n');
  writeFileSync(TS_OUT, text);
}

async function main() {
  const pictures = await loadPictures();
  const ids = Object.keys(pictures);
  if (ids.length !== 20) throw new Error(`Expected 20 pictures, found ${ids.length}`);
  const photos = new Set(ids.map((id) => `${pictures[id].exerciseId}-${pictures[id].frame}`));
  if (photos.size !== 20) throw new Error('Two programs share a source photo; the twenty must be distinct');
  const exercises = new Set(ids.map((id) => pictures[id].exerciseId));
  if (exercises.size !== 20) throw new Error('Two programs share a source exercise; the twenty must be distinct');

  mkdirSync(OUT, { recursive: true });
  for (const id of ids) await buildOne(id, pictures[id]);

  // Drop pictures of programs that are no longer listed, then write the TypeScript.
  const wanted = new Set(ids.flatMap((id) => [`${id}-card.webp`, `${id}-thumb.webp`]));
  for (const file of readdirSync(OUT)) if (!wanted.has(file)) rmSync(join(OUT, file));
  writeTs(pictures);

  const bytes = [...wanted].reduce((sum, file) => sum + statSync(join(OUT, file)).size, 0);
  console.log(`${ids.length} programs, ${wanted.size} pictures, ${(bytes / 1024).toFixed(0)} KB.`);
}

await main();
