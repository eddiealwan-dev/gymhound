import { router } from 'expo-router';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import FinishSummaryScreen from '../../app/finish/[id]';
import { savedWorkoutOf, saveWorkoutAs } from '../db/repositories/savedWorkoutsRepo';
import type { FinishSummary } from '../db/repositories/workoutViewsRepo';
import type { PrHighlight } from '../domain/prs';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRead: { summary: FinishSummary | null; unit: 'lb' | 'kg' };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 'w1' }),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRead, bumpData: jest.fn() }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/savedWorkoutsRepo', () => ({ savedWorkoutOf: jest.fn(() => null), saveWorkoutAs: jest.fn() }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../db/repositories/workoutViewsRepo', () => ({ getFinishSummary: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** Push A, an hour long, with three sets logged and `next` as the rule left it. */
const pushA = (next: FinishSummary['next'], prs: PrHighlight[] = []): FinishSummary => ({
  id: 'w1',
  name: 'Push A',
  durationMs: 3_600_000,
  volume: 4320,
  setCount: 3,
  next,
  prs,
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FinishSummaryScreen />);
  });
  return tree;
}

/** Every string drawn on screen, in order. */
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

describe('the finish summary (8.5, R64)', () => {
  it("shows next time's weight for each exercise, in order, under the stats and above Done", () => {
    mockRead = {
      unit: 'lb',
      summary: pushA([
        { name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
        { name: 'Overhead press', loggingType: 'weighted', outcome: 'held_marked', nextWeight: 95, nextUnit: 'lb', mark: 'pain' },
        { name: 'Incline dumbbell press', loggingType: 'weighted', outcome: 'held', nextWeight: 50, nextUnit: 'lb', mark: null },
        { name: 'Assisted pull-up', loggingType: 'assisted', outcome: 'raised', nextWeight: 30, nextUnit: 'lb', mark: null },
        { name: 'Triceps pushdown', loggingType: 'weighted', outcome: 'no_sets', nextWeight: 40, nextUnit: 'lb', mark: null },
      ]),
    };
    const text = shownText(mount());

    const lines = [
      'Barbell bench press — next time 140 lb ↑',
      'Overhead press — holds at 95 lb · Pain',
      'Incline dumbbell press — holds at 50 lb',
      'Assisted pull-up — next time 30 lb ↓',
      'Triceps pushdown — holds at 40 lb',
    ];
    const logged = text.indexOf('3 sets');
    expect(logged).toBeGreaterThan(-1);
    expect(text.slice(logged + 1)).toEqual([...lines, 'Save as a workout', 'Done']);
  });

  it('shows no next-time line when no exercise has a rule', () => {
    mockRead = { unit: 'lb', summary: pushA([]) };
    const text = shownText(mount());

    expect(text.slice(text.indexOf('3 sets') + 1)).toEqual(['Save as a workout', 'Done']);
  });
});

/** A bench press personal best of `kind` at 185 lb. */
const benchPr = (kind: PrHighlight['kind'], reps = 5): PrHighlight => ({
  exerciseId: 'barbell-bench-press',
  name: 'Bench press',
  loggingType: 'weighted',
  kind,
  weight: 185,
  weightUnit: 'lb',
  reps,
  durationS: null,
  localDate: '2026-10-11',
});

const plankPr: PrHighlight = {
  exerciseId: 'plank',
  name: 'Plank',
  loggingType: 'timed',
  kind: 'longest_hold',
  weight: null,
  weightUnit: null,
  reps: null,
  durationS: 90,
  localDate: '2026-10-11',
};

describe('personal bests on the finish summary (R104, R105)', () => {
  const next: FinishSummary['next'] = [
    { name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
  ];

  it('lists each personal best after the next-time lines, under "Personal bests", each with a PR mark', () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), benchPr('reps_at_weight', 8), plankPr]) };
    const text = shownText(mount());

    expect(text.slice(text.indexOf('Barbell bench press — next time 140 lb ↑') + 1)).toEqual([
      'Personal bests',
      'PR',
      'Bench press — heaviest: 185 lb × 5',
      'PR',
      'Bench press — most reps at 185 lb: 8',
      'PR',
      'Plank — longest hold: 1:30',
      'Save as a workout',
      'Done',
    ]);
  });

  it('hides the section when there are none', () => {
    mockRead = { unit: 'lb', summary: pushA(next) };
    const text = shownText(mount());

    expect(text).not.toContain('Personal bests');
    expect(text).not.toContain('PR');
  });

  it('reads each row to VoiceOver as one sentence, and the heading as a heading', () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), plankPr]) };
    const tree = mount();

    const rows = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessible === true && /^Personal best\./.test(n.props.accessibilityLabel ?? ''));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Personal best. Bench press — heaviest: 185 lb × 5',
      'Personal best. Plank — longest hold: 1:30',
    ]);
    const heading = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'Personal bests');
    expect(heading[0].props.accessibilityRole).toBe('header');
  });

  it('marks PR in red, and lets the line wrap with the text size', () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest')]) };
    const tree = mount();

    const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
    const mark = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'PR')[0];
    expect(flat(mark.props.style)).toMatchObject({ color: '#E10600', fontSize: 14 });
    const line = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'Bench press — heaviest: 185 lb × 5')[0];
    expect(line.props.numberOfLines).toBeUndefined();
    expect(line.props.allowFontScaling).not.toBe(false);
    expect(flat(line.props.style)).toMatchObject({ flex: 1 });
  });
});

describe('leaving the finish summary (R78)', () => {
  beforeEach(() => jest.clearAllMocks());

  /** Presses the button labelled `label`. */
  function pressButton(tree: ReactTestRenderer, label: string): void {
    const button = tree.root.findAllByType(Button).find((b) => b.props.label === label)!;
    act(() => button.props.onPress());
  }

  it('Done goes back to the Train screen already there, without stacking another', () => {
    mockRead = { unit: 'lb', summary: pushA([]) };
    pressButton(mount(), 'Done');

    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('Back to Train does the same when the workout is not there', () => {
    mockRead = { unit: 'lb', summary: null };
    pressButton(mount(), 'Back to Train');

    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Save as a workout on the finish summary (R118, R120)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRead = { unit: 'lb', summary: pushA([]) };
    jest.mocked(savedWorkoutOf).mockReturnValue(null);
    jest.mocked(saveWorkoutAs).mockReturnValue('saved-1');
  });

  const buttonsLabelled = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  const pressButton = (tree: ReactTestRenderer, label: string) => act(() => buttonsLabelled(tree, label)[0].props.onPress());
  const nameField = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === 'Workout name')!;

  it('is a secondary button just above Done, with room between them', () => {
    const tree = mount();
    const [save] = buttonsLabelled(tree, 'Save as a workout');
    expect(save.props.variant).toBe('secondary');
    const text = shownText(tree);
    expect(text.slice(text.indexOf('Save as a workout') + 1)).toEqual(['Done']);
    const wrapper = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'save-as-workout')[0];
    expect(Object.assign({}, ...[wrapper.props.style].flat())).toMatchObject({ marginBottom: 16 });
  });

  it('opens a sheet with the name prefilled; Save saves it and the button becomes "Saved as Push A."', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    expect(shownText(tree)).toContain('Save as a workout');
    expect(nameField(tree).props.value).toBe('Push A');

    pressButton(tree, 'Save');

    expect(saveWorkoutAs).toHaveBeenCalledWith('db', 'w1', 'Push A', expect.any(Number));
    expect(bumpData).toHaveBeenCalled();
    const text = shownText(tree);
    expect(text).toContain('Saved as Push A.');
    expect(buttonsLabelled(tree, 'Save as a workout')).toEqual([]);
    expect(nameField(tree)).toBeUndefined();
  });

  it('saves the name as typed, trimmed', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    act(() => nameField(tree).props.onChangeText('  Chest day '));
    pressButton(tree, 'Save');

    expect(saveWorkoutAs).toHaveBeenCalledWith('db', 'w1', '  Chest day ', expect.any(Number));
    expect(shownText(tree)).toContain('Saved as Chest day.');
  });

  it('an invalid name shows the validation line and saves nothing', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    act(() => nameField(tree).props.onChangeText('   '));
    pressButton(tree, 'Save');

    expect(saveWorkoutAs).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Give the workout a name.');
  });

  it('says what stopped the save when the repository refuses', () => {
    jest.mocked(saveWorkoutAs).mockImplementation(() => {
      throw new Error('Nothing logged to save.');
    });
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    pressButton(tree, 'Save');

    expect(shownText(tree)).toContain('Nothing logged to save.');
    expect(shownText(tree)).not.toContain('Saved as Push A.');
  });

  it('Cancel closes the sheet and saves nothing', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    pressButton(tree, 'Cancel');

    expect(nameField(tree)).toBeUndefined();
    expect(saveWorkoutAs).not.toHaveBeenCalled();
    expect(buttonsLabelled(tree, 'Save as a workout')).toHaveLength(1);
  });

  it('a workout started from a saved workout says it remembers today’s sets, with no button', () => {
    jest.mocked(savedWorkoutOf).mockReturnValue({ id: 's1', name: 'Push day' });
    const tree = mount();

    expect(savedWorkoutOf).toHaveBeenCalledWith('db', 'w1');
    const text = shownText(tree);
    expect(text).toContain("Push day remembers today's sets.");
    expect(text.slice(text.indexOf("Push day remembers today's sets.") + 1)).toEqual(['Done']);
    expect(buttonsLabelled(tree, 'Save as a workout')).toEqual([]);
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });
});
