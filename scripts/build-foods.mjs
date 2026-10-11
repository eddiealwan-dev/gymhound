// Builds GymHound's bundled foods from USDA FoodData Central, SR Legacy (April 2018 CSV release), public domain under
// CC0 1.0: spec §10.3 and R139. Run it from the project root:  node scripts/build-foods.mjs
//
// scripts/vendor/usda-fdc/picklist.json is the hand-picked list: { fdcId, name, portion } per food, where `name` is the
// plain name GymHound shows and `portion` is the serving:
//   "1 large"                                  an FDC food_portion, as "{amount} {modifier}", matched exactly
//   { "fdc": "1 tablespoon", "label": "1 tbsp" } the same, shown under another label
//   { "fdc": "1 slice", "grams": 29 }           the same, when FDC lists that description twice with different weights
//   { "label": "3 oz", "grams": 85 }           a serving FDC does not list for that food (taken from a close relative)
//
// If scripts/.cache/FoodData_Central_sr_legacy_food_csv_2018-04.zip is there (gitignored; download it once from
// https://fdc.nal.usda.gov/download-datasets), the picked foods' per-100 g energy (1008), protein (1003), carbohydrate
// (1005) and fat (1004), and their portions, are read from it and written to scripts/vendor/usda-fdc/sr-legacy-subset.json.
// Without the zip, that committed subset is used, so a rebuild needs no download unless the picklist adds a food.
//
// It writes src/seed/foods.json: per serving, kcal whole and grams to 0.1. Never edit foods.json by hand. A food without
// an energy value, a portion that matches nothing (or two different weights), and a name or id twice stop the build
// before anything is written.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'scripts', 'vendor', 'usda-fdc');
const PICKLIST = join(VENDOR, 'picklist.json');
const SUBSET = join(VENDOR, 'sr-legacy-subset.json');
const ZIP = join(ROOT, 'scripts', '.cache', 'FoodData_Central_sr_legacy_food_csv_2018-04.zip');
const FOODS_OUT = join(ROOT, 'src', 'seed', 'foods.json');

const NUTRIENTS = { 1008: 'kcal', 1003: 'protein', 1005: 'carbs', 1004: 'fat' };

const SOURCE = {
  source: 'USDA FoodData Central, SR Legacy, April 2018 CSV release (FoodData_Central_sr_legacy_food_csv_2018-04.zip)',
  url: 'https://fdc.nal.usda.gov/download-datasets',
  license: 'CC0 1.0 Universal (public domain)',
  citation:
    'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov. ' +
    'USDA National Nutrient Database for Standard Reference, Legacy Release, April 2018.',
  note: 'Only the foods in picklist.json: per 100 g energy (kcal), protein, carbohydrate (by difference) and fat (g), and FDC portions in grams. Written by scripts/build-foods.mjs.',
};

/** The files of a zip archive, by name (stored or deflated entries only, which is all the USDA zip uses). */
function readZip(path) {
  const zip = readFileSync(path);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error(`${path} is not a zip file`);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`${name}: unsupported zip method ${method}`);
    files.set(name.split('/').pop(), () => (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
  }
  return files;
}

/** RFC 4180 rows, header first. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

/** Each row of a CSV as an object keyed by the header. */
function records(text) {
  const [header, ...rows] = parseCsv(text);
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** The picked foods as SR Legacy has them, from the downloaded zip. */
function subsetFromZip(ids) {
  const files = readZip(ZIP);
  const csv = (name) => {
    const file = files.get(name);
    if (!file) throw new Error(`${name} is not in ${ZIP}`);
    return records(file());
  };
  const wanted = new Set(ids.map(String));
  const foods = new Map();
  for (const f of csv('food.csv')) {
    if (wanted.has(f.fdc_id)) foods.set(f.fdc_id, { fdcId: Number(f.fdc_id), description: f.description, per100g: {}, portions: [] });
  }
  for (const n of csv('food_nutrient.csv')) {
    const key = NUTRIENTS[n.nutrient_id];
    const food = foods.get(n.fdc_id);
    if (key && food) food.per100g[key] = Number(n.amount);
  }
  const portions = csv('food_portion.csv')
    .filter((p) => foods.has(p.fdc_id))
    .sort((a, b) => Number(a.seq_num) - Number(b.seq_num));
  for (const p of portions) {
    const description = [p.amount, p.portion_description || p.modifier].filter(Boolean).join(' ').trim();
    foods.get(p.fdc_id).portions.push({ description, grams: Number(p.gram_weight) });
  }
  for (const id of wanted) if (!foods.has(id)) throw new Error(`fdc ${id} is not in SR Legacy`);
  return ids.map((id) => {
    const f = foods.get(String(id));
    return { ...f, per100g: { kcal: f.per100g.kcal, protein: f.per100g.protein, carbs: f.per100g.carbs, fat: f.per100g.fat } };
  });
}

/** Rounds to `places` decimals, half away from zero, without binary-fraction slips (4.755 → 4.8, not 4.7). */
function round(value, places) {
  const scale = 10 ** places;
  return Math.round(Number((value * scale).toPrecision(12))) / scale;
}

/** The serving a pick asks for: its label and weight. */
function servingOf(pick, food) {
  const portion = typeof pick.portion === 'string' ? { fdc: pick.portion } : pick.portion;
  if (portion.fdc === undefined) {
    if (!portion.label || !(portion.grams > 0)) throw new Error(`${pick.name}: a serving needs a label and grams`);
    return { label: portion.label, grams: portion.grams };
  }
  let matches = food.portions.filter((p) => p.description === portion.fdc);
  if (portion.grams !== undefined) matches = matches.filter((p) => p.grams === portion.grams);
  const weights = new Set(matches.map((p) => p.grams));
  if (weights.size !== 1) {
    const listed = food.portions.map((p) => `"${p.description}" = ${p.grams} g`).join('; ');
    throw new Error(`${pick.name}: portion "${portion.fdc}" matches ${weights.size === 0 ? 'nothing' : 'several weights'}. FDC lists: ${listed}`);
  }
  return { label: portion.label ?? portion.fdc, grams: matches[0].grams };
}

function build() {
  const picks = JSON.parse(readFileSync(PICKLIST, 'utf8'));
  const ids = picks.map((p) => p.fdcId);
  if (new Set(ids).size !== ids.length) throw new Error('an fdcId is picked twice');
  const names = picks.map((p) => p.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error(`a name is used twice: ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`);

  let subset;
  if (existsSync(ZIP)) {
    subset = subsetFromZip(ids);
    console.log(`Read ${subset.length} foods from ${ZIP}`);
  } else {
    subset = JSON.parse(readFileSync(SUBSET, 'utf8')).foods;
    const vendored = new Set(subset.map((f) => f.fdcId));
    const missing = ids.filter((id) => !vendored.has(id));
    if (missing.length > 0) throw new Error(`Not in the vendored subset (download the SR Legacy zip to ${ZIP}): ${missing.join(', ')}`);
    console.log(`Read ${subset.length} foods from the vendored subset`);
  }
  const byId = new Map(subset.map((f) => [f.fdcId, f]));

  const foods = picks.map((pick) => {
    const food = byId.get(pick.fdcId);
    const per100 = food.per100g;
    if (per100.kcal === undefined) throw new Error(`${pick.name} (fdc ${pick.fdcId}) has no energy value`);
    for (const key of ['protein', 'carbs', 'fat']) {
      if (per100[key] === undefined) throw new Error(`${pick.name} (fdc ${pick.fdcId}) has no ${key} value`);
    }
    const { label, grams } = servingOf(pick, food);
    const per = (value) => (value * grams) / 100;
    return {
      id: `fdc-${pick.fdcId}`,
      name: pick.name,
      servingLabel: label,
      servingGrams: round(grams, 1),
      kcal: round(per(per100.kcal), 0),
      proteinG: round(per(per100.protein), 1),
      carbsG: round(per(per100.carbs), 1),
      fatG: round(per(per100.fat), 1),
    };
  });

  if (existsSync(ZIP)) {
    const kept = subset.filter((f) => ids.includes(f.fdcId));
    const body = kept.map((f) => `    ${JSON.stringify(f)}`).join(',\n');
    writeFileSync(SUBSET, `{\n${Object.entries(SOURCE).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n  "foods": [\n${body}\n  ]\n}\n`);
  }
  writeFileSync(FOODS_OUT, `[\n${foods.map((f) => `  ${JSON.stringify(f)}`).join(',\n')}\n]\n`);
  const size = (path) => `${(readFileSync(path).length / 1024).toFixed(1)} KB`;
  console.log(`Wrote ${foods.length} foods to src/seed/foods.json (${size(FOODS_OUT)}); subset ${size(SUBSET)}`);
}

build();
