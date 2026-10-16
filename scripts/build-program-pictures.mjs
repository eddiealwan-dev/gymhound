// Builds the program card pictures: spec §18.29, R632 and Appendix E. Run it from the project root:
//   npm run build:pictures
//
// Each of the twenty programs shows one free-exercise-db photo (the Unlicense) of its signature movement. The picture
// is built from the ORIGINAL photo, not the library's 360 px copy in assets/exercises: the script finds the exercise's
// `sourceId` in src/seed/library.generated.ts and downloads
//   https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/{sourceId}/{frame}.jpg
// into scripts/.cache/free-exercise-db/{sourceId}/{frame}.jpg (gitignored; downloaded once, then reused). It writes the
// only copies of:
//   assets/programs/{programId}-card.webp   up to 1080 x 720, the whole 3:2 frame: a full-width banner of 360 pt at 3x, quality 70
//   assets/programs/{programId}-thumb.webp  288 x 288, a square crop centred on the lifter (the Routines row, 96 pt at 3x), quality 60
//   src/seed/programPictures.generated.ts   the pictures as static require() calls, and each one's source
// The treatment is one for all of them, so photos shot against different walls (some red) read as a series, and red
// stays for the wordmark, the active tab and the PR marks: grayscale and a slight contrast lift.
// Nothing is enlarged: a source smaller than 1080 x 720 is used at its largest size (the script says which). As of
// Round 16c every original is 850 px wide, so the twenty cards come out 850 x 567 (or 569), about 2.4x on a 360 pt banner.
// Never edit the generated files by hand.
//
// PICTURES (by program number): the movement and the frame (0 = start, 1 = end of the rep) chosen for each program, by looking at both
// frames of each candidate: the one that shows the working position (the bottom of a squat, the bar at the chest,
// the lockout) most clearly. If src/seed/programMapping.ts exists and exports PICTURES, the script reads that
// instead of this copy (shape: number -> { exerciseId, frame, label }); keep the two in step (Task 13 checks).

import { existsSync, mkdirSync, renameSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts', '.cache', 'free-exercise-db');
const LIBRARY = join(ROOT, 'src', 'seed', 'library.generated.ts');
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const SOURCE_ID = /^[A-Za-z0-9_.-]+$/;
const OUT = join(ROOT, 'assets', 'programs');
const TS_OUT = join(ROOT, 'src', 'seed', 'programPictures.generated.ts');
const MAPPING = join(ROOT, 'src', 'seed', 'programMapping.ts');

// CARD is shown full width, 3:2, at about 360 pt wide (3x = 1080 x 720); THUMB at 96 x 96 pt (3x = 288).
const CARD = { width: 1080, height: 720 };
const THUMB = 288;
const CARD_QUALITY = 70;
const THUMB_QUALITY = 60;
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
  2: { exerciseId: 'dumbbell-bench-press', frame: 1, label: 'Dumbbell bench press' }, // the lockout: both dumbbells stacked over the chest, clearly visible (frame 0 hides one behind the head)
  3: { exerciseId: 'pull-up', frame: 1, label: 'Pull-up' }, // chin over the bar
  4: { exerciseId: 'barbell-overhead-press', frame: 1, label: 'Overhead press' }, // the lockout
  5: { exerciseId: 'barbell-row', frame: 0, label: 'Barbell row' }, // bent over, the pull
  6: { exerciseId: 'barbell-front-squat', frame: 1, label: 'Front squat' }, // the bottom
  7: { exerciseId: 'barbell-romanian-deadlift', frame: 0, label: 'Romanian deadlift' }, // the hinge
  8: { exerciseId: 'fedb-one-arm-kettlebell-swings', frame: 0, label: 'Kettlebell swing' }, // the one-arm swing's photo; the bell in the hands
  9: { exerciseId: 'fedb-recumbent-bike', frame: 0, label: 'Recumbent bike' }, // Bike intervals; the rowing machine's photos show a brand name
  10: { exerciseId: 'glute-bridge', frame: 1, label: 'Glute bridge' }, // the top; both hip thrust frames are dominated by the plate
  11: { exerciseId: 'barbell-bench-press', frame: 1, label: 'Bench press' }, // bar at the chest
  12: { exerciseId: 'barbell-deadlift', frame: 1, label: 'Deadlift' }, // the lockout
  13: { exerciseId: 'fedb-dumbbell-shoulder-press', frame: 1, label: 'Dumbbell shoulder press' }, // the lockout, both dumbbells overhead; the dumbbell squat photos show a logo on the shirt and shorts (owner's #13 pick was the dumbbell squat)
  14: { exerciseId: 'fedb-kneeling-hip-flexor', frame: 1, label: 'Kneeling hip flexor stretch' }, // closest to the couch stretch
  15: { exerciseId: 'barbell-curl', frame: 1, label: 'Barbell curl' }, // the top
  16: { exerciseId: 'fedb-handstand-push-ups', frame: 0, label: 'Handstand push-up' }, // the lockout, arms straight (frame 1 is the bottom, head near the floor); the nearest advanced move to the owner's planche, which the library has no photo of; the muscle-up and ring photos show a gym logo
  17: { exerciseId: 'fedb-push-press', frame: 1, label: 'Push press' }, // the dip
  18: { exerciseId: 'fedb-snatch', frame: 0, label: 'Snatch' }, // the bottom, wide grip
  19: { exerciseId: 'fedb-atlas-stones', frame: 1, label: 'Atlas stone' }, // the stone lifted to the lap, the lift's working position (frame 0 is the lifter bent over before the pull); the owner chose it over the sled push
  20: { exerciseId: 'fedb-running-treadmill', frame: 1, label: 'Running on a treadmill' }, // side on
};

/** Where 'attention' misses the lifter (a plate or a machine draws it), the square crop to use instead, in source px. */
const THUMB_CROP = {
  // none needed with the current picks; e.g. 'photo-id': { left: 120, top: 0, size: 240 },
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
const webp = (pipeline, file, quality) => pipeline.webp({ quality, effort: 6 }).toFile(file);

/** Library exercise id to its free-exercise-db id. */
async function loadSourceIds() {
  const mod = await import(pathToFileURL(LIBRARY).href);
  return new Map(mod.LIBRARY_EXERCISES.map((e) => [e.id, e.sourceId]));
}

/** The original photo, downloaded once into the cache (a temporary file, renamed; three tries, 30 s each), as build-library.mjs does. */
async function sourcePhoto(sourceId, frame) {
  if (!SOURCE_ID.test(sourceId)) throw new Error(`Unexpected free-exercise-db id: ${sourceId}`);
  const path = `${sourceId}/${frame}.jpg`;
  const file = join(CACHE, ...path.split('/'));
  if (existsSync(file) && statSync(file).size > 0) return file;
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(IMAGE_BASE + path, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) throw new Error(`not an image (${type})`);
      writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
      renameSync(temporary, file);
      return file;
    } catch (error) {
      lastError = error;
      rmSync(temporary, { force: true });
    }
  }
  throw new Error(`Could not download ${path}: ${lastError}`);
}

/** Programs whose source photo is smaller than the card; each is used at its largest size. */
const small = [];

async function buildOne(programId, { exerciseId, frame }, sourceIds) {
  const sourceId = sourceIds.get(exerciseId);
  if (sourceId === undefined || sourceId === null) throw new Error(`${programId}: ${exerciseId} has no free-exercise-db sourceId in the library`);
  const source = await sourcePhoto(sourceId, frame);
  const meta = await sharp(source).metadata();

  // Card: the whole 3:2 frame, cropped from the centre and scaled down only; a smaller source keeps its own size.
  if (meta.width < CARD.width || meta.height < CARD.height) small.push(`${programId} (${exerciseId}-${frame}: ${meta.width}x${meta.height})`);
  const card = sharp(source).resize({ width: CARD.width, height: CARD.height, fit: 'cover', position: 'centre', withoutEnlargement: true });
  await webp(treat(card), join(OUT, `${programId}-card.webp`), CARD_QUALITY);

  // Thumb: a square crop centred on the lifter, scaled down only.
  const crop = THUMB_CROP[exerciseId];
  const thumb =
    crop === undefined
      ? sharp(source).resize({ width: THUMB, height: THUMB, fit: 'cover', position: 'attention', withoutEnlargement: true })
      : sharp(source).extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size }).resize(THUMB, THUMB);
  await webp(treat(thumb), join(OUT, `${programId}-thumb.webp`), THUMB_QUALITY);
}

function writeTs(pictures) {
  const ids = Object.keys(pictures);
  const pics = ids.map((id) => `  '${id}': { card: require('../../assets/programs/${id}-card.webp'), thumb: require('../../assets/programs/${id}-thumb.webp') },`);
  const sources = ids.map((id) => `  '${id}': { exerciseId: '${pictures[id].exerciseId}', frame: ${pictures[id].frame} },`);
  const text = [
    '// Generated by scripts/build-program-pictures.mjs from free-exercise-db photos (the Unlicense; spec R632).',
    '// Do not edit: change the picture mapping and run `npm run build:pictures`.',
    "import type { ImageSourcePropType } from 'react-native';",
    '',
    '/** Each program’s grayscale card picture (1080 × 720) and Routines thumbnail (288 × 288); a card is at most 1080 wide, 850 where the original is smaller, keyed by program id. */',
    'export const PROGRAM_PICTURES: Readonly<Record<string, { card: ImageSourcePropType; thumb: ImageSourcePropType }>> = {',
    ...pics,
    '};',
    '',
    '/** The library exercise and frame each picture is made from (the original free-exercise-db photo, not the bundled copy). */',
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
  const sourceIds = await loadSourceIds();
  for (const id of ids) await buildOne(id, pictures[id], sourceIds);
  if (small.length > 0) console.log(`Smaller than 1080 x 720, used at their largest size: ${small.join('; ')}`);

  // Drop pictures of programs that are no longer listed, then write the TypeScript.
  const wanted = new Set(ids.flatMap((id) => [`${id}-card.webp`, `${id}-thumb.webp`]));
  for (const file of readdirSync(OUT)) if (!wanted.has(file)) rmSync(join(OUT, file));
  writeTs(pictures);

  const bytes = [...wanted].reduce((sum, file) => sum + statSync(join(OUT, file)).size, 0);
  console.log(`${ids.length} programs, ${wanted.size} pictures, ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MB).`);
}

await main();
