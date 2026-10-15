import { router } from 'expo-router';
import { setActiveProgram } from '../../db/repositories/programRunRepo';
import { Image, StyleSheet, Text } from 'react-native';
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

  it('shows a 48pt picture, the name in Body strong and the line as a caption; no Set active pill', () => {
    mockRoutines = TWENTY;
    const tree = mount();
    const row = rowTarget(tree, 'Barbell Foundations');
    const image = row.findByType(Image);
    expect(image.props.source).toBe(2);
    // A 48pt frame; the photo fills it inside the 1px border.
    expect(StyleSheet.flatten(image.parent!.props.style)).toMatchObject({ width: 48, height: 48, borderWidth: 1 });
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 46, height: 46 });
    const name = row.findAll((n) => n.type === Text && n.props.children === 'Barbell Foundations')[0];
    expect(StyleSheet.flatten(name.props.style)).toMatchObject({ fontFamily: 'Inter_600SemiBold', fontSize: 16 });
    const line = row.findAll((n) => n.type === Text && n.props.children === '3 days a week · 12 weeks · Beginner')[0];
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ fontSize: 14, color: '#a39d90' });
    expect(buttons(tree, 'Set active')).toHaveLength(0);
    // A program with no picture yet has none, and its row closes up.
    expect(rowTarget(tree, 'Dumbbell Full Body').findAllByType(Image)).toHaveLength(0);
  });

  it('a name breaks only after its slash (§18.24)', () => {
    const tree = mount();
    const row = rowTarget(tree, 'Advanced Upper/Lower DUP');
    expect(row.findAll((n) => n.type === Text && n.props.children === 'Advanced Upper/​Lower DUP')).toHaveLength(1);
  });

  it('the program in use says Active in its row, and its label says so', () => {
    mockRoutines = TWENTY.map((r) => (r.id === 'program-lean-out' ? { ...r, isActive: true } : r));
    const tree = mount();
    const row = rowTarget(tree, 'Lean Out');
    expect(row.props.accessibilityLabel).toBe('Lean Out, 4 days a week · 10 weeks · Intermediate, active');
    expect(row.findAll((n) => n.type === Text && n.props.children === 'Active')).toHaveLength(1);
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
  it('shows the Pro pill in its row, says so to VoiceOver, and See Pro in its options', () => {
    mockPro = false;
    mockRoutines = TWENTY;
    const tree = mount();
    const row = rowTarget(tree, 'Advanced Upper/Lower DUP');
    expect(row.props.accessibilityLabel).toBe('Advanced Upper/Lower DUP, 4 days a week · 6 weeks · Advanced, part of GymHound Pro');
    const pill = row.findAll((n) => n.type === Text && n.props.children === 'Pro')[0];
    expect(pill).toBeDefined();
    // On DESIGN.md's tokens: the label type, a Seam edge (Strong Seam is for controls), field corners, 8/4 padding.
    expect(StyleSheet.flatten(pill.props.style)).toMatchObject({ fontSize: 14, letterSpacing: 0.5 });
    let tag = pill.parent;
    while (tag && StyleSheet.flatten(tag.props.style)?.borderWidth === undefined) tag = tag.parent;
    expect(StyleSheet.flatten(tag!.props.style)).toMatchObject({ borderColor: '#2e2a23', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 });
    // The pill is a mark in the row, not a button of its own, and never red.
    expect(buttons(tree, 'Pro')).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
    act(() => tree.root.findAll((n) => n.props.accessibilityLabel === 'Options for Advanced Upper/Lower DUP' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(buttons(tree, 'See Pro').length).toBeGreaterThan(0);
    expect(buttons(tree, 'Set active')).toHaveLength(0);
  });

  it('with Pro there is no Pro pill', () => {
    const tree = mount();
    expect(rowTarget(tree, 'Advanced Upper/Lower DUP').findAll((n) => n.type === Text && n.props.children === 'Pro')).toHaveLength(0);
  });

  it('at a large text size the pill drops under the line instead of squeezing the name', () => {
    mockPro = false;
    mockFontScale = 2;
    const tree = mount();
    const row = rowTarget(tree, 'Advanced Upper/Lower DUP');
    expect(row.findAll((n) => n.type === Text && n.props.children === 'Pro')).toHaveLength(1);
    expect(row.findAll((n) => n.type === Text && n.props.children === 'Advanced Upper/​Lower DUP')).toHaveLength(1);
  });
});
