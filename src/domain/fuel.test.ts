import {
  caloriesSpoken,
  dayTotals,
  entryTotals,
  fuelNumber,
  gramsSpoken,
  kcalProteinSpoken,
  kcalProteinText,
  leftSpoken,
  leftText,
  MAX_SERVINGS,
  parseQuickAdd,
  parseServings,
  rescaleEntry,
  SERVING_CHIPS,
  servingsFromGrams,
  servingsFromWeight,
  servingsText,
  targetsFor,
  validateCustomFood,
  validateTargets,
} from './fuel';
import type { CustomFoodInput, MacroInput } from './fuel';

const egg = { kcal: 100, proteinG: 6, carbsG: 0.5, fatG: 7 };

describe('parseServings', () => {
  it.each([
    ['1', 1],
    ['1,5', 1.5],
    ['1.5', 1.5],
    [' 2 ', 2],
    ['0.33', 0.33],
    ['0.333', 0.33],
    ['0.01', 0.01],
    ['50', 50],
  ])('reads %p as %p', (text, value) => expect(parseServings(text)).toBe(value));

  it.each(['0', '-1', '51', '50.01', 'abc', '', '0.001', '1.2.3', '1,5,0'])('refuses %p', (text) =>
    expect(parseServings(text)).toBeNull(),
  );

  it('caps at 50', () => expect(MAX_SERVINGS).toBe(50));
});

describe('entryTotals', () => {
  it('multiplies one serving by the servings, unrounded', () => {
    expect(entryTotals(egg, 1.5)).toEqual({ kcal: 150, proteinG: 9, carbsG: 0.75, fatG: 10.5 });
  });

  it('keeps fractions of a calorie', () => {
    expect(entryTotals({ kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 }, 0.33).kcal).toBeCloseTo(33, 10);
  });
});

describe('rescaleEntry', () => {
  it("rescales from the entry's own totals (R142)", () => {
    const entry = { kcal: 300, proteinG: 20, carbsG: 4, fatG: 10, servings: 2 };
    expect(rescaleEntry(entry, 1)).toEqual({ kcal: 150, proteinG: 10, carbsG: 2, fatG: 5 });
  });

  it('scales up as well as down', () => {
    expect(rescaleEntry({ kcal: 100, proteinG: 6, carbsG: 0, fatG: 7, servings: 1 }, 2.5)).toEqual({
      kcal: 250,
      proteinG: 15,
      carbsG: 0,
      fatG: 17.5,
    });
  });
});

describe('dayTotals', () => {
  it('sums unrounded, so three entries of 33.333 kcal total "100" (R156)', () => {
    const third = { kcal: 33.333, proteinG: 1.333, carbsG: 0, fatG: 0 };
    const totals = dayTotals([third, third, third]);
    expect(fuelNumber(totals.kcal)).toBe('100');
    expect(fuelNumber(totals.proteinG)).toBe('4');
  });

  it('is zero for no entries', () => {
    expect(dayTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('targetsFor', () => {
  const targets = {
    training: { kcal: 2800, protein: 180, carbs: 300, fat: null },
    rest: { kcal: 2400, protein: 180, carbs: null, fat: 70 },
  };

  it('uses the training targets on a training day and the rest targets otherwise (§7.11)', () => {
    expect(targetsFor(targets, true)).toBe(targets.training);
    expect(targetsFor(targets, false)).toBe(targets.rest);
  });
});

describe('fuelNumber', () => {
  it('rounds to a whole number with thousands separators', () => {
    expect(fuelNumber(1839.6, 'en-US')).toBe('1,840');
    expect(fuelNumber(12345.4, 'en-US')).toBe('12,345');
    expect(fuelNumber(86.5)).toBe('87');
  });

  it('never shows "-0"', () => {
    expect(fuelNumber(-0.3)).toBe('0');
  });
});

describe('leftText', () => {
  it('shows what is left', () => {
    expect(leftText(2600, 1360, '', 'en-US')).toEqual({ value: '1,240', over: false });
    expect(leftText(180, 94, ' g')).toEqual({ value: '86 g', over: false });
  });

  it('reads "over" when past the target (§8.10)', () => {
    expect(leftText(2600, 2720, '')).toEqual({ value: '120 over', over: true });
    expect(leftText(180, 192, ' g')).toEqual({ value: '12 g over', over: true });
    expect(leftText(2600, 3840, '', 'en-US')).toEqual({ value: '1,240 over', over: true });
  });

  it('rounds the difference once', () => {
    expect(leftText(180, 179.6, ' g')).toEqual({ value: '0 g', over: false });
    expect(leftText(180, 180.4, ' g')).toEqual({ value: '0 g', over: false });
    expect(leftText(180, 180.6, ' g')).toEqual({ value: '1 g over', over: true });
  });
});

describe('servingsText', () => {
  it.each([
    [1, '1'],
    [1.5, '1.5'],
    [0.33, '0.33'],
    [0.333333, '0.33'],
    [2.5, '2.5'],
  ])('%p reads %p', (n, text) => expect(servingsText(n, 'en-US')).toBe(text));

  it("uses the locale's decimal mark", () => {
    expect(servingsText(1.5, 'de-DE')).toBe('1,5');
    expect(servingsText(0.333333, 'de-DE')).toBe('0,33');
    expect(servingsText(2, 'de-DE')).toBe('2');
  });
});

const macros = (m: Partial<MacroInput>): MacroInput => ({ kcal: '', protein: '', carbs: '', fat: '', ...m });

describe('parseQuickAdd', () => {
  it('reads the macros, blank carbs and fat as 0 (R143)', () => {
    expect(parseQuickAdd({ name: ' Shake ', ...macros({ kcal: '250', protein: '40,5' }) })).toEqual({
      ok: true,
      name: 'Shake',
      totals: { kcal: 250, proteinG: 40.5, carbsG: 0, fatG: 0 },
    });
  });

  it('names a blank entry "Quick add"', () => {
    const r = parseQuickAdd({ name: '  ', ...macros({ kcal: '120' }) });
    expect(r).toEqual({ ok: true, name: 'Quick add', totals: { kcal: 120, proteinG: 0, carbsG: 0, fatG: 0 } });
  });

  it('takes protein alone', () => {
    expect(parseQuickAdd({ name: '', ...macros({ protein: '30' }) }).ok).toBe(true);
  });

  it('needs calories or protein', () => {
    expect(parseQuickAdd({ name: '', ...macros({}) })).toEqual({
      ok: false,
      errors: { form: 'Enter calories or protein.' },
    });
    expect(parseQuickAdd({ name: '', ...macros({ kcal: '0', protein: '0', carbs: '20' }) })).toEqual({
      ok: false,
      errors: { form: 'Enter calories or protein.' },
    });
  });

  it('checks each number against its bounds (R143)', () => {
    expect(
      parseQuickAdd({ name: '', ...macros({ kcal: '10001', protein: '1001', carbs: '-1', fat: 'x' }) }),
    ).toEqual({
      ok: false,
      errors: { kcal: 'Check this number', protein: 'Check this number', carbs: 'Check this number', fat: 'Check this number' },
    });
    expect(parseQuickAdd({ name: '', ...macros({ kcal: '10000', protein: '1000', carbs: '1000', fat: '1000' }) }).ok).toBe(
      true,
    );
  });

  it('keeps the name to 60 characters, counted as code points', () => {
    expect(parseQuickAdd({ name: 'a'.repeat(61), ...macros({ kcal: '100' }) })).toEqual({
      ok: false,
      errors: { name: 'Keep the name to 60 characters.' },
    });
    expect(parseQuickAdd({ name: '🍳'.repeat(60), ...macros({ kcal: '100' }) }).ok).toBe(true);
  });
});

describe('validateTargets', () => {
  const day = (m: Partial<MacroInput>) => macros({ kcal: '2600', protein: '180', ...m });

  it('reads both days, blank carbs and fat as null (R145)', () => {
    expect(validateTargets({ training: day({ carbs: '300', fat: '80' }), rest: day({ kcal: '2400' }) })).toEqual({
      ok: true,
      targets: {
        training: { kcal: 2600, protein: 180, carbs: 300, fat: 80 },
        rest: { kcal: 2400, protein: 180, carbs: null, fat: null },
      },
    });
  });

  it('needs calories and protein on both days', () => {
    expect(validateTargets({ training: day({ kcal: '' }), rest: day({ protein: ' ' }) })).toEqual({
      ok: false,
      errors: { 'training.kcal': 'Needed.', 'rest.protein': 'Needed.' },
    });
  });

  it('checks the bounds (R145)', () => {
    expect(
      validateTargets({
        training: day({ kcal: '499', protein: '0', carbs: '1501', fat: '501' }),
        rest: day({ kcal: '10001', protein: '501', carbs: 'lots', fat: '-1' }),
      }),
    ).toEqual({
      ok: false,
      errors: {
        'training.kcal': 'Check this number',
        'training.protein': 'Check this number',
        'training.carbs': 'Check this number',
        'training.fat': 'Check this number',
        'rest.kcal': 'Check this number',
        'rest.protein': 'Check this number',
        'rest.carbs': 'Check this number',
        'rest.fat': 'Check this number',
      },
    });
    expect(
      validateTargets({
        training: day({ kcal: '500', protein: '1', carbs: '0', fat: '0' }),
        rest: day({ kcal: '10000', protein: '500', carbs: '1500', fat: '500' }),
      }).ok,
    ).toBe(true);
  });
});

describe('validateCustomFood', () => {
  const food = (f: Partial<CustomFoodInput>): CustomFoodInput => ({
    name: 'Overnight oats',
    servingLabel: '1 jar',
    servingGrams: '',
    kcal: '420',
    protein: '',
    carbs: '',
    fat: '',
    ...f,
  });

  it('reads a food, trimmed, with blank grams as null and blank macros as 0 (R144)', () => {
    expect(validateCustomFood(food({ name: '  Overnight oats ', servingLabel: ' 1 jar ', protein: '25,5' }), [])).toEqual({
      ok: true,
      food: {
        name: 'Overnight oats',
        servingLabel: '1 jar',
        servingGrams: null,
        kcal: 420,
        proteinG: 25.5,
        carbsG: 0,
        fatG: 0,
      },
    });
    const withGrams = validateCustomFood(food({ servingGrams: '350' }), []);
    expect(withGrams.ok && withGrams.food.servingGrams).toBe(350);
  });

  it('needs a name', () => {
    expect(validateCustomFood(food({ name: '  ' }), [])).toEqual({ ok: false, errors: { name: 'Give the food a name.' } });
  });

  it('keeps the name to 60 characters', () => {
    expect(validateCustomFood(food({ name: 'a'.repeat(61) }), [])).toEqual({
      ok: false,
      errors: { name: 'Keep the name to 60 characters.' },
    });
    expect(validateCustomFood(food({ name: 'a'.repeat(60) }), []).ok).toBe(true);
  });

  it('refuses a name you already have, ignoring case', () => {
    expect(validateCustomFood(food({ name: 'overnight OATS' }), ['Granola', ' Overnight oats '])).toEqual({
      ok: false,
      errors: { name: 'You already have a food called Overnight oats.' },
    });
  });

  it('needs a serving label', () => {
    expect(validateCustomFood(food({ servingLabel: ' ' }), [])).toEqual({
      ok: false,
      errors: { servingLabel: 'Say what one serving is, like 1 cup.' },
    });
  });

  it('needs the calories', () => {
    expect(validateCustomFood(food({ kcal: '' }), [])).toEqual({
      ok: false,
      errors: { kcal: 'Enter the calories in one serving.' },
    });
  });

  it('checks every number', () => {
    expect(
      validateCustomFood(food({ servingGrams: '0', kcal: '10001', protein: '1001', carbs: 'x', fat: '-2' }), []),
    ).toEqual({
      ok: false,
      errors: {
        servingGrams: 'Check this number',
        kcal: 'Check this number',
        protein: 'Check this number',
        carbs: 'Check this number',
        fat: 'Check this number',
      },
    });
    expect(validateCustomFood(food({ servingGrams: '1001' }), []).ok).toBe(false);
    expect(validateCustomFood(food({ servingGrams: '1000', kcal: '0', protein: '1000' }), []).ok).toBe(true);
  });
});

describe('spoken amounts', () => {
  it('says 1 gram and 1 calorie in the singular, as shown (rounded)', () => {
    expect(gramsSpoken(1)).toBe('1 gram');
    expect(gramsSpoken(1.4)).toBe('1 gram');
    expect(gramsSpoken(0)).toBe('0 grams');
    expect(gramsSpoken(1.6)).toBe('2 grams');
    expect(gramsSpoken(1840, 'en-US')).toBe('1,840 grams');
    expect(caloriesSpoken(1)).toBe('1 calorie');
    expect(caloriesSpoken(72)).toBe('72 calories');
  });

  it('writes and says calories and protein', () => {
    expect(kcalProteinText({ kcal: 1840.4, proteinG: 6 }, 'en-US')).toBe('1,840 kcal · 6 g protein');
    expect(kcalProteinSpoken({ kcal: 72, proteinG: 6 }, 'en-US')).toBe('72 calories, 6 grams protein');
    expect(kcalProteinSpoken({ kcal: 1, proteinG: 1 }, 'en-US')).toBe('1 calorie, 1 gram protein');
  });
});

describe('SERVING_CHIPS (R141)', () => {
  it('are ½ 1 1½ 2, each said in words', () => {
    expect(SERVING_CHIPS.map((c) => [c.label, c.value, c.spoken])).toEqual([
      ['½', 0.5, 'Half a serving'],
      ['1', 1, '1 serving'],
      ['1½', 1.5, '1 and a half servings'],
      ['2', 2, '2 servings'],
    ]);
  });
});

describe('leftSpoken', () => {
  it('says what is left in words, rounded as leftText rounds it', () => {
    expect(leftSpoken(2600, 1360, 'calories', 'en-US')).toBe('1,240 calories');
    expect(leftSpoken(180, 179, 'grams')).toBe('1 gram');
    expect(leftSpoken(180, 181, 'grams')).toBe('1 gram over');
    expect(leftSpoken(180, 192, 'grams')).toBe('12 grams over');
    expect(leftSpoken(2600, 2601, 'calories')).toBe('1 calorie over');
    expect(leftSpoken(180, 180.4, 'grams')).toBe('0 grams');
  });
});

describe('servingsFromGrams (R548)', () => {
  it('turns a weight into servings of the food, rounded as typed servings are', () => {
    expect(servingsFromGrams('170', 85)).toBe(2);
    expect(servingsFromGrams('100', 28.4)).toBe(3.52);
    expect(servingsFromGrams('42,5', 85)).toBe(0.5);
  });

  it('refuses no weight, a food with no serving weight, and more than the servings bound', () => {
    expect(servingsFromGrams('', 85)).toBeNull();
    expect(servingsFromGrams('0', 85)).toBeNull();
    expect(servingsFromGrams('abc', 85)).toBeNull();
    expect(servingsFromGrams('100', null)).toBeNull();
    expect(servingsFromGrams('100000', 85)).toBeNull();
  });
});

describe('servingsFromWeight (R552)', () => {
  it('takes ounces too: 6 oz of a 3 oz (85 g) serving is 2 servings', () => {
    expect(servingsFromWeight('6', 85, 'oz')).toBe(2);
    expect(servingsFromWeight('1', 28.35, 'oz')).toBe(1);
    expect(servingsFromWeight('170', 85, 'g')).toBe(2);
    expect(servingsFromWeight('0', 85, 'oz')).toBeNull();
  });
});
