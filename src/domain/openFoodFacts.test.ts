import { barcodeVariants, expandUpcE, foodFromProduct, foodsFromSearch, normalizeBarcode, openFoodFactsCountry } from './openFoodFacts';

/** A product as Open Food Facts' API v2 returns it with GymHound's fields. */
const yogurt = {
  code: '0818290011978',
  product_name: 'Plain Non-Fat Greek Yogurt',
  brands: 'Chobani,Chobani Inc',
  serving_size: '1 container (150 g)',
  serving_quantity: '150',
  serving_quantity_unit: 'g',
  nutriments: { 'energy-kcal_100g': 53.3, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 0 },
};

describe('Open Food Facts products as foods (R546)', () => {
  it('puts the brand before the name and works the macros out for its own serving', () => {
    expect(foodFromProduct(yogurt, '')).toEqual({
      barcode: '0818290011978',
      name: 'Chobani, Plain Non-Fat Greek Yogurt',
      servingLabel: '1 container (150 g)',
      servingGrams: 150,
      kcal: 80,
      proteinG: 15,
      carbsG: 6,
      fatG: 0,
    });
  });

  it("doesn't repeat a brand the name starts with", () => {
    expect(foodFromProduct({ ...yogurt, product_name: 'Chobani Greek Yogurt' }, '')?.name).toBe('Chobani Greek Yogurt');
  });

  it('uses 100 g when the product gives no serving, and kJ when it gives no kcal', () => {
    const food = foodFromProduct({ code: '12345678', product_name: 'Oats', nutriments: { 'energy-kj_100g': 1580, proteins_100g: '13.5', carbohydrates_100g: 58.7, fat_100g: 7 } }, '');
    expect(food).toMatchObject({ servingLabel: '100 g', servingGrams: 100, kcal: 378, proteinG: 13.5, carbsG: 58.7, fatG: 7 });
  });

  it('keeps a drink in ml, with no grams', () => {
    const food = foodFromProduct({ code: '049000028911', product_name: 'Coca-Cola', serving_size: '355 ml', serving_quantity: 355, serving_quantity_unit: 'ml', nutriments: { 'energy-kcal_100g': 42, carbohydrates_100g: 10.6 } }, '');
    expect(food).toMatchObject({ servingLabel: '355 ml', servingGrams: null, kcal: 149, carbsG: 37.6, proteinG: 0 });
  });

  it('uses per-serving values when there are no per-100 g ones and the serving is known', () => {
    const food = foodFromProduct({ code: '12345678', product_name: 'Bar', serving_size: '1 bar (60 g)', serving_quantity: 60, nutriments: { 'energy-kcal_serving': 230, proteins_serving: 20, carbohydrates_serving: 24, fat_serving: 8 } }, '');
    expect(food).toMatchObject({ kcal: 230, proteinG: 20, carbsG: 24, fatG: 8, servingGrams: 60 });
  });

  it('refuses what cannot be a food: no name, no calories, or impossible numbers', () => {
    expect(foodFromProduct({ ...yogurt, product_name: ' ' }, '')).toBeNull();
    expect(foodFromProduct({ ...yogurt, nutriments: { proteins_100g: 10 } }, '')).toBeNull();
    expect(foodFromProduct({ ...yogurt, nutriments: { 'energy-kcal_100g': 4000 } }, '')).toBeNull();
    expect(foodFromProduct({ ...yogurt, nutriments: { 'energy-kcal_100g': 50, fat_100g: 140 } }, '')).toBeNull();
    expect(foodFromProduct({ ...yogurt, code: 'abc' }, 'nope')).toBeNull();
    expect(foodFromProduct(null, '12345678')).toBeNull();
    expect(foodFromProduct('yogurt', '12345678')).toBeNull();
  });

  it('takes the scanned code when the product has none, and shortens a very long name', () => {
    const food = foodFromProduct({ ...yogurt, code: undefined, product_name: 'A'.repeat(80) }, '12345678');
    expect(food?.barcode).toBe('12345678');
    expect([...(food?.name ?? '')].length).toBe(60);
    expect(food?.name.endsWith('…')).toBe(true);
  });

  it('reads a search: the usable products, each barcode once', () => {
    const foods = foodsFromSearch({ count: 3, products: [yogurt, { code: '1', product_name: 'No calories' }, yogurt] });
    expect(foods.map((f) => f.barcode)).toEqual(['0818290011978']);
    expect(foodsFromSearch({})).toEqual([]);
    expect(foodsFromSearch(null)).toEqual([]);
  });
});

describe('barcodes', () => {
  it('takes EAN-8, UPC-A, EAN-13 and GTIN-14, with spaces or dashes', () => {
    expect(normalizeBarcode('0 49000-02891 1')).toBe('049000028911');
    expect(normalizeBarcode('12345678')).toBe('12345678');
    expect(normalizeBarcode('1234')).toBeNull();
    expect(normalizeBarcode('abcdefghijkl')).toBeNull();
  });

  it('tries a UPC-A with and without the 0 that makes it an EAN-13', () => {
    expect(barcodeVariants('049000028911')).toEqual(['049000028911', '0049000028911']);
    expect(barcodeVariants('0049000028911')).toEqual(['0049000028911', '049000028911']);
    expect(barcodeVariants('5000112548167')).toEqual(['5000112548167']);
  });

  it('writes a UPC-E out as its UPC-A, as databases list it', () => {
    expect(expandUpcE('04963406')).toBe('049000006346');
    expect(expandUpcE('01234505')).toBe('012000003455');
    expect(expandUpcE('01234531')).toBe('012300000451');
    expect(expandUpcE('01234548')).toBe('012340000058');
    expect(expandUpcE('01234567')).toBe('012345000067');
    expect(expandUpcE('54963406')).toBeNull();
    expect(barcodeVariants('04963406')).toEqual(['04963406', '049000006346', '0049000006346']);
  });

  it("searches the phone's country, the UK as uk, else the whole world", () => {
    expect(openFoodFactsCountry('US')).toBe('us');
    expect(openFoodFactsCountry('GB')).toBe('uk');
    expect(openFoodFactsCountry(null)).toBe('world');
    expect(openFoodFactsCountry('419')).toBe('world');
  });
});
