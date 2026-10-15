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
// Nothing is enlarged. (One source, the Bulgarian split squat, is a 240 x 360 portrait: its 3:2 card is the
// 240 x 160 band around the lifter, brought up to 360 x 240, the only enlargement; see CARD_BAND.)
// Never edit the generated files by hand.
//
// PICTURES: the movement and the frame (0 = start, 1 = end of the rep) chosen for each program, by looking at both
// frames of each candidate: the one that shows the working position (the bottom of a squat, the bar at the chest,
// the lockout) most clearly. If src/seed/programMapping.ts exists and exports PICTURES, the script reads that
// instead of this copy; keep the two in step (Task 13 checks).

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

/** Appendix E, in program number order: program id, the movement, its source exercise and frame. */
const OWN_PICTURES = {
  'program-barbell-foundations': { exerciseId: 'barbell-back-squat', frame: 1 }, // #1 Barbell back squat: the bottom
  'program-dumbbell-full-body': { exerciseId: 'dumbbell-goblet-squat', frame: 1 }, // #2 Goblet squat: the bottom
  'program-calisthenics-foundations': { exerciseId: 'pull-up', frame: 1 }, // #3 Pull-up: chin over the bar
  'program-minimalist-two-day': { exerciseId: 'barbell-overhead-press', frame: 1 }, // #4 Overhead press: the lockout
  'program-upper-lower-powerbuilding': { exerciseId: 'barbell-row', frame: 0 }, // #5 Barbell row: bent over, the pull
  'program-push-pull-legs': { exerciseId: 'barbell-front-squat', frame: 1 }, // #6 Front squat: the bottom
  'program-full-body-three-day': { exerciseId: 'barbell-romanian-deadlift', frame: 0 }, // #7 Romanian deadlift: the hinge
  'program-kettlebell-strength-conditioning': { exerciseId: 'fedb-one-arm-kettlebell-swings', frame: 1 }, // #8 the one-arm swing's photo
  'program-lean-out': { exerciseId: 'fedb-rowing-stationary', frame: 1 }, // #9 Rowing machine: the finish
  'program-glute-lower-body-emphasis': { exerciseId: 'barbell-hip-thrust', frame: 1 }, // #10 Hip thrust: the top
  'program-advanced-upper-lower-dup': { exerciseId: 'barbell-bench-press', frame: 1 }, // #11 Bench press: bar at the chest
  'program-strength-peaking-block': { exerciseId: 'barbell-deadlift', frame: 1 }, // #12 Deadlift: the lockout
  'program-dumbbell-full-body-ii': { exerciseId: 'dumbbell-bulgarian-split-squat', frame: 1 }, // #13 Bulgarian split squat: the bottom
  'program-mobility-for-lifters': { exerciseId: 'fedb-kneeling-hip-flexor', frame: 1 }, // #14 Kneeling hip flexor stretch (closest to the couch stretch)
  'program-bro-split': { exerciseId: 'barbell-curl', frame: 1 }, // #15 Barbell curl: the top
  'program-advanced-calisthenics': { exerciseId: 'fedb-muscle-up', frame: 1 }, // #16 Muscle-up: through the rings
  'program-crossfit-foundations': { exerciseId: 'fedb-push-press', frame: 1 }, // #17 Push press: the dip
  'program-crossfit-performance': { exerciseId: 'fedb-snatch', frame: 0 }, // #18 Snatch: the bottom, wide grip
  'program-strongman-prep': { exerciseId: 'fedb-atlas-stones', frame: 1 }, // #19 Atlas stones: stone to the chest
  'program-hybrid-athlete': { exerciseId: 'fedb-running-treadmill', frame: 1 }, // #20 Running on a treadmill
};

/** A source taller than 3:2 has no room for the whole frame: the top of the 3:2 band around the lifter, in source px. */
const CARD_BAND = {
  'dumbbell-bulgarian-split-squat': { top: 85 },
};

/** Where 'attention' misses the lifter (a plate or a machine draws it), the left edge of the square crop, in source px. */
const THUMB_LEFT = {
  'barbell-hip-thrust': 120,
  'fedb-rowing-stationary': 120,
};

async function loadPictures() {
  if (!existsSync(MAPPING)) return OWN_PICTURES;
  const mod = await import(pathToFileURL(MAPPING).href);
  return mod.PICTURES ?? OWN_PICTURES;
}

const treat = (pipeline) => pipeline.grayscale().linear(CONTRAST.a, CONTRAST.b);
const webp = (pipeline, file) => pipeline.webp({ quality: QUALITY, effort: 6 }).toFile(file);

async function buildOne(programId, { exerciseId, frame }) {
  const source = join(PHOTOS, `${exerciseId}-${frame}.webp`);
  if (!existsSync(source)) throw new Error(`${programId}: no photo ${exerciseId}-${frame}.webp in assets/exercises`);
  const meta = await sharp(source).metadata();

  // Card: the whole 3:2 frame (a 1 px trim if the source is 241 tall). Enlarged only for a portrait source.
  let card = sharp(source);
  const band = CARD_BAND[exerciseId];
  if (meta.width < CARD.width || meta.height < CARD.height) {
    if (!band) throw new Error(`${programId}: ${exerciseId} is ${meta.width}x${meta.height}; give it a CARD_BAND`);
    const height = Math.round((meta.width * CARD.height) / CARD.width);
    card = card.extract({ left: 0, top: band.top, width: meta.width, height }).resize(CARD.width, CARD.height, { kernel: 'lanczos3' });
  } else {
    card = card.resize({ width: CARD.width, height: CARD.height, fit: 'cover', position: 'centre', withoutEnlargement: true });
  }
  await webp(treat(card), join(OUT, `${programId}-card.webp`));

  // Thumb: a square crop centred on the lifter, scaled down only.
  const left = THUMB_LEFT[exerciseId];
  const thumb =
    left === undefined
      ? sharp(source).resize({ width: THUMB, height: THUMB, fit: 'cover', position: 'attention' })
      : sharp(source).extract({ left, top: 0, width: CARD.height, height: CARD.height }).resize(THUMB, THUMB);
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
