import { router } from 'expo-router';
import { setActiveProgram } from '../../db/repositories/programRunRepo';
import { Image, StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import Routines from '../../../app/(tabs)/routines/index';
import type { RoutineSummary } from '../../db/repositories/routinesRepo';
import { setActiveRoutine, userRoutineCount } from '../../db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../../db/repositories/workoutsRepo';
import { PROGRAM_ORDER, PROGRAMS } from '../../seed/programs.generated';
import { Button } from '../Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRoutines: RoutineSummary[];
let mockPro: boolean;
let mockFontScale = 1;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 812, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: (query: (db: string) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('../../db/repositories/routinesRepo', () => ({
  listRoutines: jest.fn(() => mockRoutines),
  setActiveRoutine: jest.fn(),
  userRoutineCount: jest.fn(),
  deleteRoutine: jest.fn(),
  duplicateRoutine: jest.fn(() => 'copy-1'),
}));
jest.mock('../../db/repositories/programRunRepo', () => ({ setActiveProgram: jest.fn(), changeRung: jest.fn(), startProgramOver: jest.fn() }));
jest.mock('../../state/routineShare', () => ({ shareRoutine: jest.fn(() => Promise.resolve('shared')) }));
jest.mock('../../db/repositories/savedWorkoutsRepo', () => ({ listSavedWorkouts: () => [], startSavedWorkout: jest.fn() }));
jest.mock('../../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }), useIsPro: () => mockPro }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getActiveWorkoutId: jest.fn() }));
jest.mock('../Footer', () => ({ Footer: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
jest.mock('../../seed/programPictures.generated', () => ({
  PROGRAM_PICTURES: {
    'program-barbell-foundations': { card: 1, thumb: 2 },
    'program-advanced-upper-lower-dup': { card: 11, thumb: 12 },
  },
}));

/** The twenty as listRoutines returns them: in Routines order (R597), each in the program group. */
const TWENTY: RoutineSummary[] = PROGRAM_ORDER.map((id) => PROGRAMS.find((p) => p.id === id)!).map((p) => ({
  id: p.id,
  name: p.name,
  isPremade: true,
  dayCount: p.days.length,
  isActive: false,
  group: 'program',
}));
const retired = (isActive = false): RoutineSummary => ({ id: 'premade-ppl-6', name: 'Push/pull/legs', isPremade: true, dayCount: 6, isActive, group: 'earlier' });
const mine: RoutineSummary = { id: 'mine', name: 'My split', isPremade: false, dayCount: 3, isActive: false, group: 'yours' };

const nameOf = (id: string) => PROGRAMS.find((p) => p.id === id)?.name ?? id;

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Routines />);
  });
  return tree;
}

function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node.replace(/​/g, ''));
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);

/** A row's own target: the pressable that opens the program's card. */
const rowTarget = (tree: ReactTestRenderer, name: string): ReactTestInstance =>
  tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(`${name}, `) &&
      typeof n.type !== 'string',
  )[0];

const restingStyle = (node: ReactTestInstance) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPro = true;
  mockFontScale = 1;
  mockRoutines = [...TWENTY, mine];
  jest.mocked(getActiveWorkoutId).mockReturnValue(null);
  jest.mocked(userRoutineCount).mockReturnValue(0);
});

afterEach(() => jest.useRealTimers());

describe('Routines: the groups (R597, R598)', () => {
  it('lists the free five first, then Pro by number, then Yours, Saved workouts, and Earlier programs when retired ones are in use', () => {
    mockRoutines = [retired(true), mine, ...TWENTY];
    const shown = shownText(mount());
    const at = (text: string) => {
      const i = shown.indexOf(text);
      expect([text, i]).not.toEqual([text, -1]);
      return i;
    };
    const order = [at('Programs'), ...PROGRAM_ORDER.map((id) => at(nameOf(id))), at('Yours'), at('My split'), at('Saved workouts'), at('Earlier programs'), at('Push/pull/legs')];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(PROGRAM_ORDER.slice(0, 5).map(nameOf)).toEqual(['Barbell Foundations', 'Dumbbell Full Body', 'Minimalist Two-Day', 'CrossFit Foundations', 'Mobility for Lifters']);
  });

  it("puts each routine under its own group's heading, whatever the list's order", () => {
    mockRoutines = [mine, retired(), ...TWENTY];
    const shown = shownText(mount());
    expect(shown.indexOf('Barbell Foundations')).toBeGreaterThan(shown.indexOf('Programs'));
    expect(shown.indexOf('Barbell Foundations')).toBeLessThan(shown.indexOf('Yours'));
    expect(shown.indexOf('My split')).toBeGreaterThan(shown.indexOf('Yours'));
    expect(shown.indexOf('Push/pull/legs')).toBeGreaterThan(shown.indexOf('Earlier programs'));
  });

  it('has no Earlier programs group while no retired program is in use', () => {
    const shown = shownText(mount());
    expect(shown).not.toContain('Earlier programs');
    expect(shown).toContain('Programs');
  });

  it('the group headings are Labels, read as headings', () => {
    mockRoutines = [retired(), ...TWENTY];
    const tree = mount();
    for (const heading of ['Programs', 'Earlier programs']) {
      const label = tree.root.findAll((n) => n.type === Text && n.props.children === heading)[0];
      expect(label.props.accessibilityRole).toBe('header');
      expect(StyleSheet.flatten(label.props.style)).toMatchObject({ textTransform: 'uppercase', fontSize: 14 });
    }
  });

  it('a retired program keeps its own row with Set active', () => {
    mockRoutines = [retired(), ...TWENTY];
    const tree = mount();
    expect(buttons(tree, 'Set active')).toHaveLength(1);
    act(() => buttons(tree, 'Set active')[0].props.onPress());
    expect(setActiveProgram).toHaveBeenCalledWith('db', 'premade-ppl-6', expect.any(Number));
  });
});

describe("Routines: a program's row (R633)", () => {
  it('is one 44pt target, read as its name and line, that opens the card', () => {
    const tree = mount();
    const row = rowTarget(tree, 'Barbell Foundations');
    expect(row.props.accessibilityLabel).toBe('Barbell Foundations, 3 days a week · 12 weeks · Beginner');
    expect(row.props.accessibilityRole).toBe('button');
    expect(restingStyle(row).minHeight).toBeGreaterThanOrEqual(44);
    act(() => row.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/routines/program-barbell-foundations');
  });

  it('shows a 64pt picture, the name in Body strong and the line as a caption; no Set active pill', () => {
    mockRoutines = TWENTY;
    const tree = mount();
    const row = rowTarget(tree, 'Barbell Foundations');
    const image = row.findByType(Image);
    expect(image.props.source).toBe(2);
    // A 64pt frame; the photo fills it inside the 1px border.
    expect(StyleSheet.flatten(image.parent!.props.style)).toMatchObject({ width: 64, height: 64, borderWidth: 1 });
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 62, height: 62 });
    const name = row.findAll((n) => n.type === Text && n.props.children === 'Barbell Foundations')[0];
    expect(StyleSheet.flatten(name.props.style)).toMatchObject({ fontFamily: 'Inter_600SemiBold', fontSize: 16 });
    // A no-break space only between a number and its word and before each "·", so a "·" never starts or ends a line
    // and the line wraps between words, never inside one, at large text (design gate #1, ruling R-g6).
    const line = row.findAll((n) => n.type === Text && n.props.children === '3\u00a0days a week\u00a0· 12\u00a0weeks\u00a0· Beginner')[0];
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ fontSize: 14, color: '#a39d90' });
    expect(buttons(tree, 'Set active')).toHaveLength(0);
    // A program with no picture yet has none, and its row closes up.
    expect(rowTarget(tree, 'Dumbbell Full Body').findAllByType(Image)).toHaveLength(0);
  });

  it('joins no more than a number and its word, and each "·" to the word before it, for every program (ruling R-g6)', () => {
    mockPro = false;
    const tree = mount();
    for (const r of TWENTY) {
      const column = rowTarget(tree, r.name).findAll((n) => n.type === View && n.props.testID === 'program-row-text')[0];
      const caption = column.findAll((n) => n.type === Text && typeof n.props.children === 'string' && n.props.children.includes('·'))[0];
      const text: string = caption.props.children;
      // Ordinary spaces everywhere else, so the line can wrap between words.
      for (const run of text.split(' ')) {
        const bare = run.replace(/\u00a0·$/, '');
        expect(bare).toMatch(/^(\d+\u00a0\S+|[^\s\u00a0]+)$/);
      }
      expect(text).not.toMatch(/(^|[^\u00a0])·/);
    }
  });

  it('a name breaks only after its slash (§18.24)', () => {
    const tree = mount();
    const row = rowTarget(tree, 'Advanced Upper/Lower DUP');
    expect(row.findAll((n) => n.type === Text && n.props.children === 'Advanced Upper/​Lower DUP')).toHaveLength(1);
  });

  it('the program in use says Active on a line under its line, in body strong, and its label says so (design gate #1)', () => {
    mockRoutines = TWENTY.map((r) => (r.id === 'program-lean-out' ? { ...r, isActive: true } : r));
    const tree = mount();
    const row = rowTarget(tree, 'Lean Out');
    expect(row.props.accessibilityLabel).toBe('Lean Out, 4 days a week · 10 weeks · Intermediate, active');
    const active = row.findAll((n) => n.type === Text && n.props.children === 'Active');
    expect(active).toHaveLength(1);
    expect(StyleSheet.flatten(active[0].props.style)).toMatchObject({ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#f1ece2' });
    // It sits in the text column, under the line, not in a column of its own beside the chevron.
    const column = row.findAll((n) => n.type === View && n.props.testID === 'program-row-text')[0];
    expect(column.findAll((n) => n.type === Text && n.props.children === 'Active')).toHaveLength(1);
  });

  it('⋯ opens its options, read as "Options for {name}", a 44pt target', () => {
    const tree = mount();
    const more = tree.root.findAll((n) => n.props.accessibilityLabel === 'Options for Barbell Foundations' && typeof n.props.onPress === 'function')[0];
    const style = restingStyle(more);
    expect((style.height ?? 0) + 2 * (more.props.hitSlop ?? 0)).toBeGreaterThanOrEqual(44);
    act(() => more.props.onPress());
    expect(shownText(tree)).toEqual(expect.arrayContaining(['Set active', 'Share routine', 'Cancel']));
  });
});

describe('Routines: a Pro program on free (R525)', () => {
  it('ends its line with "Pro", says so to VoiceOver, and See Pro in its options (design gate #1)', () => {
    mockPro = false;
    mockRoutines = TWENTY;
    const tree = mount();
    const row = rowTarget(tree, 'Advanced Upper/Lower DUP');
    expect(row.props.accessibilityLabel).toBe('Advanced Upper/Lower DUP, 4 days a week · 6 weeks · Advanced, part of GymHound Pro');
    const line = row.findAll((n) => n.type === Text && n.props.children === '4\u00a0days a week\u00a0· 6\u00a0weeks\u00a0· Advanced\u00a0· Pro')[0];
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ fontSize: 14, color: '#a39d90' });
    // A state is a word, never a pill: nothing in the row has an edge but the picture's.
    const edged = row.findAll((n) => n.type === View && (StyleSheet.flatten(n.props.style)?.borderWidth ?? 0) > 0);
    expect(edged.every((n) => StyleSheet.flatten(n.props.style)?.width === 64)).toBe(true);
    // The mark is in the row's line, not a button of its own, and never red.
    expect(buttons(tree, 'Pro')).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
    act(() => tree.root.findAll((n) => n.props.accessibilityLabel === 'Options for Advanced Upper/Lower DUP' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(buttons(tree, 'See Pro').length).toBeGreaterThan(0);
    expect(buttons(tree, 'Set active')).toHaveLength(0);
  });

  it('an active Pro program keeps "Active" on its own line, and "Pro" on its line (walkthrough)', () => {
    mockPro = false;
    mockRoutines = TWENTY.map((r) => (r.id === 'program-advanced-upper-lower-dup' ? { ...r, isActive: true } : r));
    const tree = mount();
    const row = rowTarget(tree, 'Advanced Upper/Lower DUP');
    expect(row.props.accessibilityLabel).toBe('Advanced Upper/Lower DUP, 4 days a week · 6 weeks · Advanced, part of GymHound Pro, active');
    expect(row.findAll((n) => n.type === Text && n.props.children === '4\u00a0days a week\u00a0· 6\u00a0weeks\u00a0· Advanced\u00a0· Pro')).toHaveLength(1);
    const column = row.findAll((n) => n.type === View && n.props.testID === 'program-row-text')[0];
    expect(column.findAll((n) => n.type === Text && n.props.children === 'Active')).toHaveLength(1);
  });

  it('with Pro the line does not say Pro', () => {
    const tree = mount();
    expect(rowTarget(tree, 'Advanced Upper/Lower DUP').findAll((n) => n.type === Text && n.props.children === '4\u00a0days a week\u00a0· 6\u00a0weeks\u00a0· Advanced')).toHaveLength(1);
  });

  it('gives the name and line the whole width between the picture and the chevron, at every size', () => {
    mockPro = false;
    for (const scale of [1, 2]) {
      mockFontScale = scale;
      const tree = mount();
      const row = rowTarget(tree, 'Advanced Upper/Lower DUP');
      const column = row.findAll((n) => n.type === View && n.props.testID === 'program-row-text')[0];
      expect(StyleSheet.flatten(column.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
      // Every text in the row is in that column: no mark beside it.
      expect(row.findAll((n) => n.type === Text).length).toBe(column.findAll((n) => n.type === Text).length);
    }
  });
});
