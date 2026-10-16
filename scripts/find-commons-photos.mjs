// Finds candidate photos on Wikimedia Commons for an exercise that has none (§18.29, Round 16c). Run it from the project
// root:
//   node scripts/find-commons-photos.mjs <outDir> <exerciseId> "<query>" ["<query>" ...]
//   node scripts/find-commons-photos.mjs <outDir> find-cats "<term>" ...     lists matching Commons categories
// A query "cat:Name" lists the files in Category:Name (the precise way; find-cats finds the names); any other query is
// a text search for the phrase, which Commons matches loosely.
// For each query it asks the Commons API for bitmap files, keeps only files under a licence the app can bundle
// (public domain, CC0, CC BY or CC BY-SA of any version: never NC, ND or anything else), drops duplicates, and downloads
// up to MAX_CANDIDATES 480px previews into <outDir>/<exerciseId>/<n>.jpg beside a candidates.json that lists each one's
// title, licence, author and page. Someone then looks at the previews and writes the chosen title into
// scripts/web-photos.json for scripts/build-web-photos.mjs. Nothing here touches the app.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundlable } from './commons-licence.mjs';

const [outDir, id, ...queries] = process.argv.slice(2);
if (!outDir || !id || queries.length === 0) {
  console.error('usage: node scripts/find-commons-photos.mjs <outDir> <exerciseId> "<query>" ["<query>" ...]');
  process.exit(2);
}

const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'GymHound-photo-sourcing/1.0 (https://github.com/eddiealwan-dev/gymhound)';
const PER_QUERY = 12;
const MAX_CANDIDATES = 8;
const PREVIEW_WIDTH = 480;

const stripTags = (html) => (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Commons categories whose name matches `term` (the precise way in: "cat:Front lever" then lists a category's files). */
async function findCategories(term) {
  const params = new URLSearchParams({ action: 'query', format: 'json', list: 'search', srnamespace: '14', srsearch: term, srlimit: '15' });
  const response = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Commons category search failed: ${response.status}`);
  const json = await response.json();
  return (json.query?.search ?? []).map((s) => s.title);
}

/**
 * One query's bundlable files. "cat:Name" lists the files of Category:Name (precise); anything else is a text search
 * for the phrase, which Commons matches loosely (a "front lever" search returns bicycle brake levers).
 */
async function search(query) {
  const common = {
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: String(PREVIEW_WIDTH),
    iiextmetadatafilter: 'LicenseShortName|Artist|LicenseUrl|Credit|ImageDescription',
  };
  const params = query.startsWith('cat:')
    ? new URLSearchParams({ ...common, generator: 'categorymembers', gcmtitle: `Category:${query.slice(4)}`, gcmtype: 'file', gcmlimit: String(PER_QUERY) })
    : new URLSearchParams({ ...common, generator: 'search', gsrsearch: `filetype:bitmap "${query}"`, gsrnamespace: '6', gsrlimit: String(PER_QUERY) });
  const response = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Commons search failed: ${response.status}`);
  const json = await response.json();
  const pages = Object.values(json.query?.pages ?? {});
  return pages
    .map((p) => {
      const info = p.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      return {
        title: p.title,
        license: stripTags(meta.LicenseShortName?.value),
        licenseUrl: stripTags(meta.LicenseUrl?.value),
        author: stripTags(meta.Artist?.value),
        credit: stripTags(meta.Credit?.value),
        description: stripTags(meta.ImageDescription?.value).slice(0, 200),
        page: info?.descriptionurl,
        preview: info?.thumburl,
        width: info?.width,
        height: info?.height,
        index: p.index ?? 0,
      };
    })
    .filter((c) => c.preview && /\.(jpe?g|png|webp)$/i.test(c.title) && bundlable(c.license))
    .sort((a, b) => a.index - b.index);
}

async function main() {
  if (id === 'find-cats') {
    for (const term of queries) console.log(`${term}: ${(await findCategories(term)).join(' | ')}`);
    return;
  }
  const dir = join(outDir, id);
  mkdirSync(dir, { recursive: true });
  const seen = new Set();
  const candidates = [];
  for (const query of queries) {
    for (const c of await search(query)) {
      if (seen.has(c.title) || candidates.length >= MAX_CANDIDATES) continue;
      seen.add(c.title);
      candidates.push({ ...c, query });
    }
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  let n = 0;
  for (const c of candidates) {
    const response = await fetch(c.preview, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) continue;
    n += 1;
    c.file = `${n}.jpg`;
    writeFileSync(join(dir, c.file), Buffer.from(await response.arrayBuffer()));
  }
  const kept = candidates.filter((c) => c.file);
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify({ id, queries, candidates: kept }, null, 2));
  console.log(`${id}: ${kept.length} candidates in ${dir}`);
  for (const c of kept) console.log(`  ${c.file}  ${c.license}  ${c.width}x${c.height}  ${c.title}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
