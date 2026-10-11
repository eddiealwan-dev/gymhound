/** @jest-environment node */
import { router } from 'expo-router';
import { BackHandler, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import FuelTargetsRoute from '../../app/(tabs)/fuel-targets';
import { getFuelTargets, setFuelTargets } from '../db/repositories/foodLogRepo';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import type { FuelTargets } from '../domain/types';
import { useDataVersion } from '../state/dataVersion';
import { leaveGuarded } from '../state/leaveGuard';
import { TargetsForm } from './fuel/TargetsForm';
import { ProPitch } from './pro/ProPitch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the form writes the `fuelTargets` setting through the food log repository.
let mockDb: Db;
let mockPro = true;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    // Focus is the mount, as on the phone when the tab opens; the cleanup runs when the screen goes.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock('../platform/entitlements', () => ({ useIsPro: () => mockPro }));
// The real form, counting its mounts: the route should mount it once, not again on its first focus.
const mockFormMounts = { count: 0 };
jest.mock('./fuel/TargetsForm', () => {
  const actual = jest.requireActual<typeof import('./fuel/TargetsForm')>('./fuel/TargetsForm');
  const { createElement, useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    TargetsForm: (props: Parameters<typeof actual.TargetsForm>[0]) => {
      useEffect(() => {
        mockFormMounts.count += 1;
      }, []);
      return createElement(actual.TargetsForm, props);
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

let closeDb: () => void;

beforeEach(() => {
  const handle = createTestDb();
  mockDb = handle.db;
  closeDb = handle.close;
  mockPro = true;
  mockAnnounce.mockClear();
  jest.mocked(router.back).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  closeDb();
});

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
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

const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] => {
  const found = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length > 0) return found;
  // A button with no separate VoiceOver label is found by its text.
  return tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityRole === 'button' &&
      n.props.accessibilityLabel === undefined &&
      n.findAll((c) => c.children.includes(label)).length > 0,
  );
};

const press = (tree: ReactTestRenderer, label: string) => {
  const found = pressables(tree, label);
  if (found.length === 0) throw new Error(`Nothing to press called ${label}`);
  act(() => found[found.length - 1].props.onPress());
};

const fields = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput);
/** A field by the start of its VoiceOver label ("Training day, Calories"), which may go on to say what is wrong. */
const field = (tree: ReactTestRenderer, label: string) => {
  const found = fields(tree).find((n) => n.props.accessibilityLabel === label || String(n.props.accessibilityLabel).startsWith(`${label}, `));
  if (!found) throw new Error(`No field called ${label}`);
  return found;
};
const type = (tree: ReactTestRenderer, label: string, text: string) => act(() => field(tree, label).props.onChangeText(text));
const valueOf = (tree: ReactTestRenderer, label: string) => field(tree, label).props.value as string;

const TARGETS: FuelTargets = {
  training: { kcal: 2800, protein: 180, carbs: 300, fat: null },
  rest: { kcal: 2400, protein: 170, carbs: null, fat: 70 },
};

function fill(tree: ReactTestRenderer, day: 'Training day' | 'Rest day', values: [string, string, string, string]) {
  const labels = ['Calories', 'Protein', 'Carbs', 'Fat'];
  labels.forEach((label, i) => type(tree, `${day}, ${label}`, values[i]));
}

describe('TargetsForm (R145)', () => {
  it('labels both days and their four fields, carbs and fat optional', () => {
    const tree = mount(<TargetsForm initial={null} submitLabel="Save" onSaved={() => {}} />);
    const t = shownText(tree);
    expect(t).toEqual(expect.arrayContaining(['Training day', 'Rest day', 'Calories', 'Protein (g)', 'Carbs (g, optional)', 'Fat (g, optional)', 'Same as training day', 'Save']));
    expect(fields(tree).map((f) => f.props.accessibilityLabel)).toEqual([
      'Training day, Calories',
      'Training day, Protein, grams',
      'Training day, Carbs, grams, optional',
      'Training day, Fat, grams, optional',
      'Rest day, Calories',
      'Rest day, Protein, grams',
      'Rest day, Carbs, grams, optional',
      'Rest day, Fat, grams, optional',
    ]);
    for (const f of fields(tree)) {
      expect(f.props.keyboardType).toBe('decimal-pad');
      expect(f.props.returnKeyType).toBe('done');
      expect(f.props.value).toBe('');
    }
  });

  it('a blank form says "Needed." beside calories and protein of both days, announces it and saves nothing', () => {
    const onSaved = jest.fn();
    const tree = mount(<TargetsForm initial={null} submitLabel="Save" onSaved={onSaved} />);
    press(tree, 'Save');
    expect(shownText(tree).filter((s) => s === 'Needed.')).toHaveLength(4);
    expect(getFuelTargets(mockDb)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockAnnounce).toHaveBeenCalledWith(
      'Training day calories: Needed. Training day protein: Needed. Rest day calories: Needed. Rest day protein: Needed.',
    );
    // The field says what is wrong with it too.
    expect(field(tree, 'Training day, Calories').props.accessibilityLabel).toBe('Training day, Calories, Needed.');
    // No live region where the announcement already speaks (it would be read twice).
    expect(tree.root.findAll((n) => n.props.accessibilityLiveRegion !== undefined && n.props.accessibilityLiveRegion !== 'none')).toHaveLength(0);
  });

  it('a number out of range says "Check this number" beside that field', () => {
    const tree = mount(<TargetsForm initial={null} submitLabel="Save" onSaved={() => {}} />);
    fill(tree, 'Training day', ['2800', '180', 'lots', '']);
    fill(tree, 'Rest day', ['100', '170', '', '']);
    press(tree, 'Save');
    expect(shownText(tree).filter((s) => s === 'Check this number')).toHaveLength(2);
    expect(shownText(tree)).not.toContain('Needed.');
    expect(field(tree, 'Training day, Carbs').props.accessibilityLabel).toBe('Training day, Carbs, grams, optional, Check this number');
    expect(getFuelTargets(mockDb)).toBeNull();
  });

  it('editing a field clears what was said about it', () => {
    const tree = mount(<TargetsForm initial={null} submitLabel="Save" onSaved={() => {}} />);
    press(tree, 'Save');
    type(tree, 'Training day, Calories', '2800');
    expect(shownText(tree).filter((s) => s === 'Needed.')).toHaveLength(3);
  });

  it('Same as training day copies the four fields into the rest day, and says so', () => {
    const tree = mount(<TargetsForm initial={null} submitLabel="Save" onSaved={() => {}} />);
    fill(tree, 'Training day', ['2800', '180', '300', '']);
    type(tree, 'Rest day, Fat', '90');
    press(tree, 'Same as training day');
    expect(['Calories', 'Protein', 'Carbs', 'Fat'].map((l) => valueOf(tree, `Rest day, ${l}`))).toEqual(['2800', '180', '300', '']);
    expect(mockAnnounce).toHaveBeenCalledWith('Rest day set to the training day numbers.');
  });

  it('Save writes both days, blank carbs and fat as null, accepts a comma, then calls onSaved', () => {
    const onSaved = jest.fn();
    const version = useDataVersion.getState().version;
    const tree = mount(<TargetsForm initial={null} submitLabel="Save targets" onSaved={onSaved} />);
    fill(tree, 'Training day', ['2800', '180,5', '', '80']);
    fill(tree, 'Rest day', ['2400', '170', '250', '']);
    press(tree, 'Save targets');
    expect(getFuelTargets(mockDb)).toEqual({
      training: { kcal: 2800, protein: 180.5, carbs: null, fat: 80 },
      rest: { kcal: 2400, protein: 170, carbs: 250, fat: null },
    });
    expect(useDataVersion.getState().version).toBeGreaterThan(version);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mockAnnounce).toHaveBeenCalledWith('Targets saved.');
  });

  it('prefills from initial, null fields blank', () => {
    const tree = mount(<TargetsForm initial={TARGETS} submitLabel="Save" onSaved={() => {}} />);
    expect(['Calories', 'Protein', 'Carbs', 'Fat'].map((l) => valueOf(tree, `Training day, ${l}`))).toEqual(['2800', '180', '300', '']);
    expect(['Calories', 'Protein', 'Carbs', 'Fat'].map((l) => valueOf(tree, `Rest day, ${l}`))).toEqual(['2400', '170', '', '70']);
  });

  it('after a save that keeps it open, the saved numbers are what it holds no changes against', () => {
    const onDirtyChange = jest.fn();
    const tree = mount(<TargetsForm initial={null} submitLabel="Save" onSaved={() => {}} onDirtyChange={onDirtyChange} />);
    fill(tree, 'Training day', ['2800', '180', '', '']);
    press(tree, 'Same as training day');
    press(tree, 'Save');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    type(tree, 'Rest day, Fat', '70');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    type(tree, 'Rest day, Fat', '');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('tells whether it holds changes', () => {
    const onDirtyChange = jest.fn();
    const tree = mount(<TargetsForm initial={TARGETS} submitLabel="Save" onSaved={() => {}} onDirtyChange={onDirtyChange} />);
    type(tree, 'Rest day, Fat', '75');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    type(tree, 'Rest day, Fat', '70');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('draws nothing in red', () => {
    const tree = mount(<TargetsForm initial={null} submitLabel="Save" onSaved={() => {}} />);
    press(tree, 'Save');
    expect(JSON.stringify(tree.toJSON()).toUpperCase()).not.toContain('#E10600');
  });
});

describe('/fuel-targets', () => {
  it('shows Back to Fuel, Targets, the line on training days and the form prefilled from the stored targets', () => {
    setFuelTargets(mockDb, TARGETS);
    const tree = mount(<FuelTargetsRoute />);
    const t = shownText(tree);
    expect(t).toEqual(expect.arrayContaining(['Fuel', 'Targets', 'Training days are days you finish a workout. Every other day uses the rest day targets.']));
    expect(valueOf(tree, 'Training day, Calories')).toBe('2800');
    expect(t).toContain('Save');
  });

  it('mounts the form once', () => {
    mockFormMounts.count = 0;
    mount(<FuelTargetsRoute />);
    expect(mockFormMounts.count).toBe(1);
  });

  it('Save stores the targets and goes back', () => {
    const tree = mount(<FuelTargetsRoute />);
    fill(tree, 'Training day', ['2800', '180', '', '']);
    press(tree, 'Same as training day');
    press(tree, 'Save');
    expect(getFuelTargets(mockDb)).toEqual({
      training: { kcal: 2800, protein: 180, carbs: null, fat: null },
      rest: { kcal: 2800, protein: 180, carbs: null, fat: null },
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).not.toContain('Discard changes?');
  });

  it('Back with nothing changed goes back at once', () => {
    setFuelTargets(mockDb, TARGETS);
    const tree = mount(<FuelTargetsRoute />);
    press(tree, 'Back to Fuel');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).not.toContain('Discard changes?');
  });

  it('leaving with changes asks "Discard changes?"; Keep editing stays with them', () => {
    const tree = mount(<FuelTargetsRoute />);
    type(tree, 'Training day, Calories', '2800');
    press(tree, 'Back to Fuel');
    expect(shownText(tree)).toEqual(expect.arrayContaining(['Discard changes?', 'Keep editing', 'Discard']));
    expect(router.back).not.toHaveBeenCalled();
    press(tree, 'Keep editing');
    expect(shownText(tree)).not.toContain('Discard changes?');
    expect(valueOf(tree, 'Training day, Calories')).toBe('2800');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('Discard goes back once the sheet closes, and the form starts again from what is stored', () => {
    jest.useFakeTimers();
    setFuelTargets(mockDb, TARGETS);
    const tree = mount(<FuelTargetsRoute />);
    type(tree, 'Training day, Calories', '3000');
    press(tree, 'Back to Fuel');
    press(tree, 'Discard');
    expect(router.back).not.toHaveBeenCalled();
    act(() => jest.runAllTimers());
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(valueOf(tree, 'Training day, Calories')).toBe('2800');
    expect(getFuelTargets(mockDb)).toEqual(TARGETS);
  });

  it('the dock and the header ask too', () => {
    const tree = mount(<FuelTargetsRoute />);
    const leave = jest.fn();
    act(() => leaveGuarded(leave));
    expect(leave).toHaveBeenCalledTimes(1);
    type(tree, 'Rest day, Protein', '150');
    act(() => leaveGuarded(leave));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toContain('Discard changes?');
  });

  it('the Android back button asks too', () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: () => {} };
    });
    const tree = mount(<FuelTargetsRoute />);
    type(tree, 'Rest day, Protein', '150');
    let handled = false;
    act(() => {
      handled = handlers[handlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(shownText(tree)).toContain('Discard changes?');
  });

  it('not Pro shows the pitch in place of the form, and leaves without asking', () => {
    mockPro = false;
    setFuelTargets(mockDb, TARGETS);
    const tree = mount(<FuelTargetsRoute />);
    expect(tree.root.findAllByType(ProPitch).map((p) => p.props.context)).toEqual(['tab']);
    expect(tree.root.findAllByType(TargetsForm)).toHaveLength(0);
    expect(shownText(tree)).toContain('Targets');
    const leave = jest.fn();
    act(() => leaveGuarded(leave));
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
