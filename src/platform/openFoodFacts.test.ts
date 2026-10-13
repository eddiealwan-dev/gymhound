/** @jest-environment node */
import { lookupBarcode, searchOnline } from './openFoodFacts';

jest.mock('./locale', () => ({ deviceRegion: () => 'US' }));

const product = {
  code: '0049000028911',
  product_name: 'Coca-Cola',
  brands: 'Coca-Cola',
  serving_size: '355 ml',
  serving_quantity: 355,
  serving_quantity_unit: 'ml',
  nutriments: { 'energy-kcal_100g': 42, carbohydrates_100g: 10.6 },
};

/** A fetch that answers each URL in turn from `answers`, recording what was asked. */
function fakeFetch(answers: ({ status: number; body: unknown } | Error)[]) {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const impl = jest.fn(async (url: string, init?: RequestInit) => {
    urls.push(url);
    headers.push((init?.headers ?? {}) as Record<string, string>);
    const next = answers.shift();
    if (next === undefined || next instanceof Error) throw next ?? new Error('no answer');
    return { status: next.status, json: async () => next.body } as Response;
  });
  return { impl: impl as unknown as typeof fetch, urls, headers };
}

describe('lookupBarcode (R546)', () => {
  it('finds a product and keeps the barcode as scanned', async () => {
    const f = fakeFetch([{ status: 200, body: { status: 1, product } }]);
    const result = await lookupBarcode('049000028911', f.impl);
    expect(result).toMatchObject({ status: 'found', food: { barcode: '049000028911', name: 'Coca-Cola', kcal: 149 } });
    expect(f.urls[0]).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/049000028911\.json\?fields=/);
    expect(f.headers[0]['User-Agent']).toMatch(/^GymHound\//);
  });

  it('tries the EAN-13 form of a UPC-A before saying it is not there', async () => {
    const f = fakeFetch([
      { status: 404, body: { status: 0, status_verbose: 'product not found' } },
      { status: 200, body: { status: 1, product } },
    ]);
    expect((await lookupBarcode('049000028911', f.impl)).status).toBe('found');
    expect(f.urls[1]).toContain('/product/0049000028911.json');
  });

  it('says not found when neither form is there, or the product has no calories', async () => {
    const notThere = fakeFetch([{ status: 404, body: { status: 0 } }, { status: 404, body: { status: 0 } }]);
    expect(await lookupBarcode('049000028911', notThere.impl)).toEqual({ status: 'not_found' });
    const noCalories = fakeFetch([{ status: 200, body: { status: 1, product: { ...product, nutriments: {} } } }]);
    expect(await lookupBarcode('5000112548167', noCalories.impl)).toEqual({ status: 'not_found' });
  });

  it('says offline when no answer comes, and unavailable when the site answers with an error', async () => {
    expect(await lookupBarcode('5000112548167', fakeFetch([new TypeError('Network request failed')]).impl)).toEqual({ status: 'offline' });
    expect(await lookupBarcode('5000112548167', fakeFetch([{ status: 503, body: null }]).impl)).toEqual({ status: 'unavailable' });
  });
});

describe('searchOnline (R546)', () => {
  it("searches the phone's country site, most scanned first, and reads the foods", async () => {
    const f = fakeFetch([{ status: 200, body: { count: 1, products: [product] } }]);
    const result = await searchOnline('coke zero', f.impl, 'US');
    expect(result).toMatchObject({ status: 'ok', foods: [{ name: 'Coca-Cola' }] });
    expect(f.urls[0]).toMatch(/^https:\/\/us\.openfoodfacts\.org\/cgi\/search\.pl\?search_terms=coke%20zero&/);
    expect(f.urls[0]).toContain('sort_by=unique_scans_n');
  });

  it('asks nothing for an empty search', async () => {
    const f = fakeFetch([]);
    expect(await searchOnline('  ', f.impl, 'US')).toEqual({ status: 'ok', foods: [] });
    expect(f.urls).toEqual([]);
  });

  it('says offline or unavailable as the lookup does', async () => {
    expect(await searchOnline('oats', fakeFetch([new TypeError('offline')]).impl, null)).toEqual({ status: 'offline' });
    expect(await searchOnline('oats', fakeFetch([{ status: 429, body: null }]).impl, null)).toEqual({ status: 'unavailable' });
  });
});
