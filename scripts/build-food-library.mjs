// Builds GymHound's large food list (§18.22, R545): about 8,200 foods from the USDA National Nutrient Database for
// Standard Reference, Release 28 (public domain), beside the 305 hand-picked foods of scripts/build-foods.mjs. It holds
// grocery staples, restaurant and fast-food items (McDonald's, Subway, Applebee's, Olive Garden …) and branded groceries
// (Kellogg's, Campbell's, Keebler …). Run it from the project root:  node scripts/build-food-library.mjs
//
// scripts/vendor/usda-sr28/sr28.json is the vendored source: for every SR28 food its NDB number, food group, long
// description, per-100 g energy (kcal), protein, carbohydrate (by difference) and fat (g), and its two household
// portions. To make it again from the SR28 abbreviated files (ABBREV.txt and FOOD_DES.txt, as USDA published them or as
// the npm package fda-nutrient-database@1.0.2 ships them), pass the folder holding them:
//   node scripts/build-food-library.mjs --from path/to/sr28
//
// It writes src/seed/foodLibrary.json: per serving, kcal whole and grams to 0.1, as foods.json. Never edit it by hand.
// Left out: baby foods (group 0300), the American Indian/Alaska Native foods (3500), foods without an energy value, and
// the foods build-foods.mjs already picked (matched by USDA's own description), so a search never shows one twice.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'scripts', 'vendor', 'usda-sr28', 'sr28.json');
const PICKED = join(ROOT, 'scripts', 'vendor', 'usda-fdc', 'sr-legacy-subset.json');
const OUT = join(ROOT, 'src', 'seed', 'foodLibrary.json');

const SOURCE = {
  source: 'USDA National Nutrient Database for Standard Reference, Release 28 (September 2015, revised May 2016), abbreviated files ABBREV.txt and FOOD_DES.txt',
  url: 'https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/sr11-sr28/',
  license: 'Public domain (U.S. Government work)',
  citation:
    'US Department of Agriculture, Agricultural Research Service, Nutrient Data Laboratory. USDA National Nutrient Database for Standard Reference, Release 28. Version Current: September 2015, slightly revised May 2016.',
  note: 'Every SR28 food: NDB number, food group, long description, per 100 g energy (kcal), protein, carbohydrate (by difference) and fat (g), and the two household portions in grams. Written by scripts/build-food-library.mjs --from.',
};

/** Food groups left out: baby foods, and the American Indian/Alaska Native foods. */
const LEFT_OUT_GROUPS = new Set(['0300', '3500']);

// ---------------------------------------------------------------------------------------------------------------
// Reading SR28's text files: fields split by ^, text fields wrapped in ~, Latin-1, CRLF.

function readSr(path) {
  return readFileSync(path, 'latin1')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split('^').map((f) => (f.startsWith('~') && f.endsWith('~') ? f.slice(1, -1) : f)));
}

const num = (s) => (s === undefined || s.trim() === '' ? null : Number(s));

function extract(from) {
  const des = new Map(readSr(join(from, 'FOOD_DES.txt')).map((r) => [r[0], r]));
  const foods = [];
  for (const r of readSr(join(from, 'ABBREV.txt'))) {
    const d = des.get(r[0]);
    if (!d) throw new Error(`ABBREV.txt has ${r[0]}, FOOD_DES.txt does not`);
    // ABBREV.txt: NDB_No, Shrt_Desc, Water, Energ_Kcal, Protein, Lipid_Tot, Ash, Carbohydrt, … then the last five fields
    // GmWt_1, GmWt_Desc1, GmWt_2, GmWt_Desc2, Refuse_Pct (sr28_doc.pdf, p. 44).
    const n = r.length;
    foods.push([r[0], d[1], d[2], num(r[3]), num(r[4]), num(r[7]), num(r[5]), num(r[n - 5]), r[n - 4] || null, num(r[n - 3]), r[n - 2] || null]);
  }
  foods.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out = { ...SOURCE, fields: ['ndb', 'group', 'description', 'kcal', 'protein', 'carbs', 'fat', 'grams1', 'portion1', 'grams2', 'portion2'], foods };
  writeFileSync(VENDOR, `${JSON.stringify(out)}\n`);
  console.log(`Wrote ${foods.length} SR28 foods to ${VENDOR}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Names: USDA writes brands in capitals ("KELLOGG'S, EGGO, Waffles"); GymHound shows them as people write them.

/** Capital-letter words that stay as they are. */
const KEEP = new Set(['KFC', 'BBQ', 'USDA', 'II', 'III', 'IV', 'XL', 'TLC', 'UHT', 'DHA', 'MSG', 'NFS', 'USA', 'A&W', 'PB', 'NY', 'TCBY', 'IHOP', 'TGI']);

function titleCore(core) {
  // Letters split by dots (T.G.I) and the kept abbreviations stay.
  if (/^([A-Z]\.)*[A-Z]\.?$/.test(core) || KEEP.has(core.replace(/[^A-Z&]/g, ''))) return core;
  if (/^Mc[A-Z']+$/.test(core)) return `Mc${titleCore(core.slice(2))}`;
  const letters = core.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2 || letters !== letters.toUpperCase()) return core;
  // Lower everything, then raise the first letter and any after a hyphen or slash: CHEEZ-IT → Cheez-It.
  return core.toLowerCase().replace(/(^|[-/])([a-z])/g, (_m, before, letter) => before + letter.toUpperCase());
}

/** A word with any brackets, quotes or punctuation around it kept as they are: "McDONALD'S," → "McDonald's,". */
function titleWord(word) {
  const [, before, core, after] = /^([("']*)(.*?)([),.;:"]*)$/.exec(word);
  return before + titleCore(core) + after;
}

export function readableName(description) {
  return description
    .replace(/\s*\(Includes foods for USDA's Food Distribution Program\)/gi, '')
    .split(' ')
    .map(titleWord)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parts of a whole as GymHound writes them for counts, as the hand-picked foods do: ½ cup, ⅛ of a pie. */
const DECIMAL_PARTS = {
  '.1': '1/10', '.083': '1/12', '.125': '⅛', '.167': '⅙', '.17': '⅙', '.2': '⅕', '.25': '¼', '.33': '⅓', '.333': '⅓',
  '.4': '⅖', '.5': '½', '.6': '⅗', '.66': '⅔', '.666': '⅔', '.667': '⅔', '.67': '⅔', '.75': '¾',
};
const SLASHED_PARTS = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '1/6': '⅙', '1/8': '⅛' };
/** Units weighed or poured, which keep a decimal: "0.8 oz", "1.5 fl oz". */
const MEASURES = /^(oz|g|ml|fl|lb|kg)\b/i;

/**
 * A household portion as people write it, in the hand-picked foods' style. Counts take fractions (".5 cup" → "½ cup",
 * ".333 package" → "⅓ package", "1/8 of 9\" pie" → "⅛ of 9\" pie"); weights keep decimals with a leading zero
 * (".8 oz" → "0.8 oz"); sizes like 1/8" thick stay as written. USDA's NLEA notes (the standard label serving) are
 * dropped or reduced to what they measure: "1 cup ( 1 NLEA serving)" → "1 cup", "1 serving (NLEA serving size =
 * 0.75 cup)" → "1 serving (¾ cup)".
 */
export function readablePortion(portion) {
  return portion
    .replace(/\(\s*1?\s*NLEA serving size\s*=\s*([^)]*)\)/gi, '($1)')
    .replace(/\(\s*1?\s*NLEA serving\s*-\s*([^)]*)\)/gi, '($1)')
    .replace(/,?\s*\(\s*1?\s*NLEA serving[^)]*\)/gi, '')
    .replace(/,\s*1 NLEA serving\b/gi, '')
    .replace(/\b1 NLEA serving\b/gi, '1 serving')
    .replace(/\bNLEA\s+/gi, '')
    .replace(/(^|[\s(,])(\d*)(\.\d+)(?=\s*(\S*))/g, (m, before, whole, part, next) => {
      if (MEASURES.test(next) || DECIMAL_PARTS[part] === undefined) return `${before}${whole || '0'}${part}`;
      return `${before}${whole === '0' ? '' : whole}${DECIMAL_PARTS[part]}`;
    })
    .replace(/(^|[\s(])(\d\/\d)(?=\s)(?!\s*in\b)/g, (m, before, f) => before + (SLASHED_PARTS[f] ?? f))
    .replace(/\b(Cups?|Tbsp|Tsp|Slices?|Pieces?)\b/g, (w) => w.toLowerCase())
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\(/g, ' (')
    .replace(/\(\s+/g, '(')
    .replace(/\s+/g, ' ')
    .replace(/[,\s]+$/, '')
    .trim();
}

// ---------------------------------------------------------------------------------------------------------------
// The library.

const round1 = (n) => Math.round(n * 10) / 10;

function build() {
  const sr = JSON.parse(readFileSync(VENDOR, 'utf8'));
  const picked = new Set(JSON.parse(readFileSync(PICKED, 'utf8')).foods.map((f) => f.description.toLowerCase()));
  const foods = [];
  const seen = new Set();
  let skippedPicked = 0;
  for (const [ndb, group, description, kcal, protein, carbs, fat, grams1, portion1] of sr.foods) {
    if (LEFT_OUT_GROUPS.has(group) || kcal === null) continue;
    if (picked.has(description.toLowerCase())) {
      skippedPicked++;
      continue;
    }
    const id = `sr28-${ndb}`;
    if (seen.has(id)) throw new Error(`${id} twice`);
    seen.add(id);
    // The first household portion when USDA gives one, else 100 g.
    const hasPortion = grams1 !== null && grams1 > 0 && portion1 !== null && portion1.trim() !== '';
    const grams = hasPortion ? grams1 : 100;
    const label = hasPortion ? readablePortion(portion1) : '100 g';
    const per = (v) => ((v ?? 0) * grams) / 100;
    foods.push([id, readableName(description), label, round1(grams), Math.round(per(kcal)), round1(per(protein)), round1(per(carbs)), round1(per(fat))]);
  }
  foods.sort((a, b) => a[1].localeCompare(b[1], 'en') || (a[0] < b[0] ? -1 : 1));
  const out = {
    source: SOURCE.source,
    license: SOURCE.license,
    note: 'Per serving: [id, name, servingLabel, servingGrams, kcal, proteinG, carbsG, fatG]. Written by scripts/build-food-library.mjs; never edit by hand.',
    foods,
  };
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`Wrote ${foods.length} foods to ${OUT} (left out ${skippedPicked} already picked in foods.json).`);
}

const fromAt = process.argv.indexOf('--from');
if (fromAt !== -1) extract(process.argv[fromAt + 1]);
build();
