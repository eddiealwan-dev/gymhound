import { barcodeVariants, foodFromProduct, foodsFromSearch, openFoodFactsCountry, type OnlineFood } from '../domain/openFoodFacts';
import { deviceRegion } from './locale';

/**
 * GymHound's calls to Open Food Facts (§18.22, R546), the only network use besides purchases: a barcode looked up when
 * you scan one, and a search when you tap Search online. Only the barcode or the words you searched are sent, with the
 * app's name as Open Food Facts asks; nothing about you. Nothing waits on it: each call gives up after 10 s, and a
 * failure says so and leaves logging by hand as it was.
 */

/** How the app names itself to Open Food Facts, which asks every app to. */
const USER_AGENT = 'GymHound/1.0 (iOS and Android lifting log)';
/** The product fields GymHound reads; asking for only these keeps each answer small. */
const FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,nutriments';
const TIMEOUT_MS = 10_000;

export type BarcodeResult =
  | { status: 'found'; food: OnlineFood }
  /** Open Food Facts doesn't have it, or has it without the calories GymHound needs. */
  | { status: 'not_found' }
  /** No connection, or none in time. */
  | { status: 'offline' }
  /** Open Food Facts answered with an error (busy, or down). */
  | { status: 'unavailable' };

export type SearchResult = { status: 'ok'; foods: OnlineFood[] } | { status: 'offline' } | { status: 'unavailable' };

type Fetch = typeof fetch;

/** GET `url` as JSON: the body and status, or 'offline' when no answer came. */
async function getJson(url: string, fetchImpl: Fetch): Promise<{ status: number; body: unknown } | 'offline'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The food for a scanned barcode. A UPC-A is tried as scanned and as its EAN-13 (and the other way), as Open Food Facts
 * may list either.
 */
export async function lookupBarcode(code: string, fetchImpl: Fetch = fetch): Promise<BarcodeResult> {
  let unavailable = false;
  for (const variant of barcodeVariants(code)) {
    const answer = await getJson(`https://world.openfoodfacts.org/api/v2/product/${variant}.json?fields=${FIELDS}&app_name=GymHound`, fetchImpl);
    if (answer === 'offline') return { status: 'offline' };
    const body = answer.body as { status?: unknown; product?: unknown } | null;
    if (answer.status === 200 && body?.status === 1) {
      const food = foodFromProduct(body.product, variant);
      // Found, but without what GymHound needs: as good as not there.
      if (food !== null) return { status: 'found', food: { ...food, barcode: code } };
      continue;
    }
    if (answer.status >= 500 || answer.status === 429) unavailable = true;
  }
  return unavailable ? { status: 'unavailable' } : { status: 'not_found' };
}

/**
 * Packaged foods matching `query`, most scanned first, from the site for the phone's country (so a search in the US
 * finds what US shops sell). Open Food Facts allows few searches a minute, so the app searches only when asked.
 */
export async function searchOnline(query: string, fetchImpl: Fetch = fetch, region: string | null = deviceRegion()): Promise<SearchResult> {
  const terms = query.trim();
  if (terms === '') return { status: 'ok', foods: [] };
  const site = openFoodFactsCountry(region);
  const url =
    `https://${site}.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(terms)}` +
    `&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&fields=${FIELDS}&app_name=GymHound`;
  const answer = await getJson(url, fetchImpl);
  if (answer === 'offline') return { status: 'offline' };
  if (answer.status !== 200) return { status: 'unavailable' };
  return { status: 'ok', foods: foodsFromSearch(answer.body) };
}
