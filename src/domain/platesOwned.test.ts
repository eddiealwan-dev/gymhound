import { MAX_PAIRS, parsePlateSize, plateRows, setPairs, STANDARD_PLATES, totalPairs } from './platesOwned';

describe('STANDARD_PLATES', () => {
  it('lists the common sizes for each unit, heaviest first', () => {
    expect(STANDARD_PLATES.lb).toEqual([45, 35, 25, 15, 10, 5, 2.5]);
    expect(STANDARD_PLATES.kg).toEqual([25, 20, 15, 10, 5, 2.5, 1.25, 0.5]);
  });
});

describe('plateRows (R107)', () => {
  it('lists every standard size, with 0 pairs where none are owned', () => {
    const rows = plateRows({ '45': 4, '25': 1 }, 'lb');
    expect(rows).toEqual([
      { size: 45, pairs: 4, standard: true },
      { size: 35, pairs: 0, standard: true },
      { size: 25, pairs: 1, standard: true },
      { size: 15, pairs: 0, standard: true },
      { size: 10, pairs: 0, standard: true },
      { size: 5, pairs: 0, standard: true },
      { size: 2.5, pairs: 0, standard: true },
    ]);
  });

  it('adds an owned size that is not standard in its place, heaviest first', () => {
    const rows = plateRows({ '45': 2, '7.5': 1 }, 'lb');
    expect(rows.map((r) => r.size)).toEqual([45, 35, 25, 15, 10, 7.5, 5, 2.5]);
    expect(rows.find((r) => r.size === 7.5)).toEqual({ size: 7.5, pairs: 1, standard: false });
  });

  it('reads a key written another way as the same size, and leaves out sizes owned at 0', () => {
    const rows = plateRows({ '2.50': 2, '3': 0 }, 'lb');
    expect(rows.find((r) => r.size === 2.5)!.pairs).toBe(2);
    expect(rows.some((r) => r.size === 3)).toBe(false);
  });

  it('uses the kg sizes for kg', () => {
    expect(plateRows({ '1.25': 1 }, 'kg').map((r) => r.size)).toEqual([25, 20, 15, 10, 5, 2.5, 1.25, 0.5]);
  });
});

describe('setPairs', () => {
  it('sets the pairs for a size, keyed as String(size)', () => {
    expect(setPairs({ '45': 4 }, 45, 5)).toEqual({ '45': 5 });
    expect(setPairs({ '45': 4 }, 2.5, 1)).toEqual({ '45': 4, '2.5': 1 });
  });

  it('clamps to 0..MAX_PAIRS and drops the size at 0', () => {
    expect(MAX_PAIRS).toBe(20);
    expect(setPairs({ '45': 4 }, 45, 25)).toEqual({ '45': 20 });
    expect(setPairs({ '45': 4, '25': 1 }, 25, 0)).toEqual({ '45': 4 });
    expect(setPairs({ '45': 4, '25': 1 }, 25, -2)).toEqual({ '45': 4 });
  });

  it('replaces a key written another way and leaves the input alone', () => {
    const owned = { '2.50': 1, '45': 4 };
    expect(setPairs(owned, 2.5, 3)).toEqual({ '2.5': 3, '45': 4 });
    expect(owned).toEqual({ '2.50': 1, '45': 4 });
  });

  it('drops other entries at 0', () => {
    expect(setPairs({ '45': 4, '35': 0 }, 45, 3)).toEqual({ '45': 3 });
  });
});

describe('parsePlateSize', () => {
  it('reads a comma or a dot', () => {
    expect(parsePlateSize('1,25', 'kg')).toBe(1.25);
    expect(parsePlateSize('7.5', 'lb')).toBe(7.5);
    expect(parsePlateSize(' 55 ', 'lb')).toBe(55);
  });

  it('refuses 0, text, too many decimals and sizes above 100 lb or 50 kg', () => {
    expect(parsePlateSize('0', 'lb')).toBeNull();
    expect(parsePlateSize('abc', 'lb')).toBeNull();
    expect(parsePlateSize('', 'lb')).toBeNull();
    expect(parsePlateSize('101', 'lb')).toBeNull();
    expect(parsePlateSize('100', 'lb')).toBe(100);
    expect(parsePlateSize('50', 'kg')).toBe(50);
    expect(parsePlateSize('50.5', 'kg')).toBeNull();
    expect(parsePlateSize('1.255', 'kg')).toBeNull();
    expect(parsePlateSize('-5', 'lb')).toBeNull();
  });
});

describe('totalPairs', () => {
  it('adds the pairs of every size', () => {
    expect(totalPairs({ '45': 4, '35': 1, '2.5': 1 })).toBe(6);
    expect(totalPairs({})).toBe(0);
  });
});
