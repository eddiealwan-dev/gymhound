/** @jest-environment node */
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Circle } from 'react-native-svg';
import { logQuickAdd } from '../db/repositories/foodLogRepo';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { bumpData } from '../state/dataVersion';
import { FuelTrends } from './fuel/FuelTrends';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the trends read the food log's daily series, as on the phone.
let mockDb: Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const TODAY = '2026-10-11';
const NOW = new Date(2026, 9, 11, 9, 0, 0).getTime();
let closeDb: () => void;

beforeEach(() => {
  const handle = createTestDb();
  mockDb = handle.db;
  closeDb = handle.close;
});

afterEach(() => {
  closeDb();
});

/** Logs a quick add for a day: kcal, then protein, carbs and fat in grams. */
function eat(localDate: string, kcal: number, proteinG = 0, carbsG = 0, fatG = 0) {
  logQuickAdd(mockDb, 'Meal', { kcal, proteinG, carbsG, fatG }, localDate, NOW);
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FuelTrends today={TODAY} />);
  });
  return tree;
}

/** Every string drawn, in order. */
function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

/** Lays the chart's plot out at a width, as the phone would, so it draws its dots. */
function layOut(tree: ReactTestRenderer) {
  const measured = tree.root.findAll((n) => typeof n.props.onLayout === 'function' && typeof n.type === 'string');
  act(() => {
    for (const m of measured) m.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 180 } } });
  });
}

const chart = (tree: ReactTestRenderer): ReactTestInstance | undefined =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'image')[0];

const option = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`No option called ${label}`);
  return found[found.length - 1];
};

const choose = (tree: ReactTestRenderer, label: string) => act(() => option(tree, label).props.onPress());

const dots = (tree: ReactTestRenderer) => tree.root.findAllByType(Circle).length;

function allPropValues(node: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object' && !('$$typeof' in (v as object))) Object.values(v as object).forEach(walk);
  };
  for (const n of [node, ...node.findAll(() => true)]) {
    const { children: _children, ...rest } = n.props;
    walk(rest);
  }
  return out;
}

describe('Fuel trends (R149)', () => {
  it('draws nothing when no finished day has food logged', () => {
    expect(mount().toJSON()).toBeNull();
    // Today alone is not over yet.
    eat(TODAY, 600, 40);
    expect(mount().toJSON()).toBeNull();
  });

  it('shows Trends as a heading, Calories and 1M chosen, one dot per logged day and the average', () => {
    eat('2026-10-01', 1800, 150);
    eat('2026-10-05', 1200, 100);
    eat('2026-10-05', 1000, 60); // the same day: one point of 2,200
    eat('2026-10-10', 2000, 170);
    eat(TODAY, 300, 20); // not over yet: left out
    eat('2026-09-01', 2500, 200); // 40 days ago: outside 1M
    const tree = mount();
    layOut(tree);
    const headings = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header');
    expect(headings).toHaveLength(1);
    expect(shownText(tree)[0]).toBe('Trends');
    expect(option(tree, 'Calories').props.accessibilityState).toEqual({ checked: true });
    expect(option(tree, '1M, last month').props.accessibilityState).toEqual({ checked: true });
    expect(dots(tree)).toBe(3);
    expect(chart(tree)!.props.accessibilityLabel).toBe(
      'Calories. Oct 1 to Oct 10: 1,800 kcal to 2,000 kcal. Lowest 1,800 kcal, highest 2,200 kcal.',
    );
    expect(shownText(tree)).toContain('Average 2,000 kcal a day over 3 logged days.');
  });

  it('switches to protein, carbs and fat, in grams', () => {
    eat('2026-10-01', 1800, 150, 200, 60);
    eat('2026-10-02', 2000, 171, 250, 70);
    const tree = mount();
    choose(tree, 'Protein');
    expect(option(tree, 'Protein').props.accessibilityState).toEqual({ checked: true });
    expect(option(tree, 'Calories').props.accessibilityState).toEqual({ checked: false });
    expect(chart(tree)!.props.accessibilityLabel).toBe('Protein. Oct 1 to Oct 2: 150 g to 171 g. Lowest 150 g, highest 171 g.');
    expect(shownText(tree)).toContain('Average 161 g a day over 2 logged days.');
    choose(tree, 'Carbs');
    expect(chart(tree)!.props.accessibilityLabel).toMatch(/^Carbs\. Oct 1 to Oct 2: 200 g to 250 g\./);
    expect(shownText(tree)).toContain('Average 225 g a day over 2 logged days.');
    choose(tree, 'Fat');
    expect(chart(tree)!.props.accessibilityLabel).toMatch(/^Fat\. /);
    expect(shownText(tree)).toContain('Average 65 g a day over 2 logged days.');
  });

  it('widens to 3M and 1Y, each chip read out with its text first', () => {
    eat('2026-10-10', 2000);
    eat('2026-08-01', 2100); // 71 days ago
    eat('2026-01-15', 2200); // 269 days ago
    eat('2025-01-15', 2300); // more than a year ago
    const tree = mount();
    layOut(tree);
    expect(dots(tree)).toBe(1);
    expect(shownText(tree)).toContain('Average 2,000 kcal a day over 1 logged day.');
    choose(tree, '3M, last 3 months');
    layOut(tree);
    expect(option(tree, '3M, last 3 months').props.accessibilityState).toEqual({ checked: true });
    expect(option(tree, '1M, last month').props.accessibilityState).toEqual({ checked: false });
    expect(dots(tree)).toBe(2);
    choose(tree, '1Y, last year');
    layOut(tree);
    expect(dots(tree)).toBe(3);
    expect(shownText(tree)).toContain('Average 2,100 kcal a day over 3 logged days.');
    expect(shownText(tree)).toEqual(expect.arrayContaining(['1M', '3M', '1Y', 'Calories', 'Protein', 'Carbs', 'Fat']));
  });

  it('says so when nothing is logged in the range, and keeps the controls', () => {
    eat('2026-07-01', 2000); // 102 days ago
    const tree = mount();
    expect(chart(tree)).toBeUndefined();
    expect(shownText(tree)).toContain('Nothing logged in this range.');
    expect(shownText(tree).some((t) => t.startsWith('Average'))).toBe(false);
    choose(tree, '1Y, last year');
    expect(chart(tree)).toBeDefined();
    expect(shownText(tree)).not.toContain('Nothing logged in this range.');
  });

  it('reads again when the food log changes', () => {
    eat('2026-10-01', 1800);
    const tree = mount();
    layOut(tree);
    expect(dots(tree)).toBe(1);
    eat('2026-10-03', 2000);
    act(() => bumpData());
    layOut(tree);
    expect(dots(tree)).toBe(2);
  });

  it('names its two groups for VoiceOver', () => {
    eat('2026-10-01', 1800);
    const tree = mount();
    const groups = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'radiogroup');
    expect(groups.map((g) => g.props.accessibilityLabel)).toEqual(['Chart measure', 'Chart range']);
  });

  it('protein, carbs and fat have the same days as calories: a logged day with 0 g still counts', () => {
    eat('2026-10-01', 1800, 150, 200, 60);
    eat('2026-10-02', 300); // a quick add of calories only: 0 g of each macro
    eat('2026-10-03', 2000, 170, 0, 70);
    const tree = mount();
    layOut(tree);
    expect(dots(tree)).toBe(3);
    for (const [measure, average] of [
      ['Protein', 'Average 107 g a day over 3 logged days.'],
      ['Carbs', 'Average 67 g a day over 3 logged days.'],
      ['Fat', 'Average 43 g a day over 3 logged days.'],
    ]) {
      choose(tree, measure);
      layOut(tree);
      expect(dots(tree)).toBe(3);
      expect(shownText(tree)).toContain(average);
      expect(chart(tree)!.props.accessibilityLabel).toMatch(/Lowest 0 g/);
    }
  });

  describe('the four measures share the well by its measured width, so "Calories" never breaks', () => {
    /** Gives the well a width and every measured label the same width, as the phone's layout would. */
    function measure(tree: ReactTestRenderer, wellWidth: number, labelWidth: number) {
      act(() => {
        tree.root.findAll((n) => n.props.testID === 'chart-measure-well' && typeof n.type === 'string')[0].props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: wellWidth, height: 52 } },
        });
        for (const label of ['Calories', 'Protein', 'Carbs', 'Fat']) {
          const probes = tree.root.findAll((n) => n.props.testID === `chart-measure-probe-${label}` && typeof n.type === 'string');
          probes[0].props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: labelWidth, height: 20 } } });
        }
      });
    }

    const widthOf = (tree: ReactTestRenderer, label: string) => {
      const flat = [option(tree, label).props.style].flat(Infinity) as ({ width?: number } | null)[];
      return flat.reduce<number | undefined>((w, s) => (s && typeof s === 'object' && s.width !== undefined ? s.width : w), undefined);
    };

    beforeEach(() => eat('2026-10-01', 1800));

    // A 342pt well has 334pt inside its 4pt padding; segments are 4pt apart, with 4pt padding each side of the words.
    it('four in a row when the longest word fits a quarter', () => {
      const tree = mount();
      measure(tree, 342, 64);
      expect(['Calories', 'Protein', 'Carbs', 'Fat'].map((l) => widthOf(tree, l))).toEqual([80, 80, 80, 80]);
    });

    it('two to a row when it does not fit a quarter but fits a half', () => {
      const tree = mount();
      measure(tree, 342, 100);
      expect(widthOf(tree, 'Calories')).toBe(165);
    });

    it('one to a row at very large text', () => {
      const tree = mount();
      measure(tree, 342, 200);
      expect(widthOf(tree, 'Calories')).toBe(334);
    });

    it('the measuring copies are hidden from VoiceOver and touch', () => {
      const tree = mount();
      const probes = tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('chart-measure-probes'));
      expect(probes.length).toBeGreaterThan(0);
      expect(probes[0].props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', pointerEvents: 'none' });
    });
  });

  it('every option is a 44pt target, and nothing is red', () => {
    eat('2026-10-01', 1800, 150);
    eat('2026-10-02', 2000, 160);
    const tree = mount();
    layOut(tree);
    for (const label of ['Calories', 'Protein', 'Carbs', 'Fat', '1M, last month', '3M, last 3 months', '1Y, last year']) {
      const flat = [option(tree, label).props.style].flat(Infinity) as ({ minHeight?: number } | null)[];
      expect(flat.some((s) => typeof s === 'object' && s !== null && (s.minHeight ?? 0) >= 44)).toBe(true);
    }
    expect(allPropValues(tree.root).map((v) => v.toUpperCase())).not.toContain('#E10600');
  });
});
