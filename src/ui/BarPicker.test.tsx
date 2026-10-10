import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { setSetting } from '../db/repositories/settingsRepo';
import { flushAll } from '../state/draftFlush';
import { BarPicker } from './BarPicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The stored settings the picker reads. A write through `setSetting` lands here, as it would in SQLite. */
const mockStored = { unit: 'lb', barLb: 45, barKg: 20 };

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ ...mockStored }),
  setSetting: jest.fn((_db: unknown, key: 'barLb' | 'barKg', value: number) => {
    mockStored[key] = value;
  }),
}));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: unknown) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount() {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<BarPicker />);
  });
  return tree;
}

/** Draws the picker again from what is stored now, as a bump or a return to the screen does. */
function reread(tree: ReturnType<typeof create>) {
  act(() => tree.update(<BarPicker />));
}

/** The pressable radio rows, each by its name (the label before any weight). */
function rows(tree: ReturnType<typeof create>) {
  const byName = new Map<string, ReturnType<typeof create>['root']>();
  for (const row of tree.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')) {
    const name = String(row.props.accessibilityLabel).split(',')[0];
    if (!byName.has(name)) byName.set(name, row);
  }
  return byName;
}

/** Each radio row's name, with whether it is ticked. */
function choices(tree: ReturnType<typeof create>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [name, row] of rows(tree)) out[name] = Boolean(row.props.accessibilityState?.checked);
  return out;
}

function choose(tree: ReturnType<typeof create>, label: string) {
  const row = rows(tree).get(label)!;
  act(() => row.props.onPress());
}

const field = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === 'Custom bar weight, lb');

/** Types `text` one key at a time, the way a phone keyboard sends it. */
function typeKeys(tree: ReturnType<typeof create>, text: string) {
  for (let i = 1; i <= text.length; i++) act(() => field(tree)!.props.onChangeText(text.slice(0, i)));
}

beforeEach(() => {
  Object.assign(mockStored, { unit: 'lb', barLb: 45, barKg: 20 });
  jest.mocked(setSetting).mockClear();
});

describe('BarPicker: a custom bar is saved when the field is left, never per keystroke', () => {
  it('stores nothing while "120" is typed, nor when it is left, and says why', () => {
    const tree = mount();
    choose(tree, 'Custom');

    typeKeys(tree, '120');
    expect(setSetting).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Enter a weight above 0, up to 100 lb.');

    act(() => field(tree)!.props.onBlur());
    expect(setSetting).not.toHaveBeenCalled();
    expect(mockStored.barLb).toBe(45);
    expect(field(tree)!.props.value).toBe('120');
  });

  it('stores a valid weight once, when the field is left or submitted', () => {
    const tree = mount();
    choose(tree, 'Custom');

    typeKeys(tree, '33,5');
    expect(setSetting).not.toHaveBeenCalled();
    act(() => field(tree)!.props.onBlur());
    expect(setSetting).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledWith('db', 'barLb', 33.5);

    typeKeys(tree, '40');
    act(() => field(tree)!.props.onSubmitEditing());
    expect(setSetting).toHaveBeenCalledTimes(2);
    expect(setSetting).toHaveBeenLastCalledWith('db', 'barLb', 40);
  });

  it('stores a valid weight typed but not left when the sheet closes or the screen is left', () => {
    const closing = mount();
    choose(closing, 'Custom');
    typeKeys(closing, '33.5');
    act(() => closing.unmount());
    expect(setSetting).toHaveBeenCalledWith('db', 'barLb', 33.5);

    // The bar is now the custom 33.5, so the field is already open.
    jest.mocked(setSetting).mockClear();
    const leaving = mount();
    typeKeys(leaving, '30');
    act(() => flushAll());
    expect(setSetting).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledWith('db', 'barLb', 30);
  });
});

describe('BarPicker: follows a bar changed by the other picker (Settings and the plate calculator)', () => {
  it('ticks Standard when a custom bar here was changed to Standard elsewhere', () => {
    mockStored.barLb = 33.5;
    const tree = mount();
    expect(choices(tree)).toEqual({ Standard: false, "Women's": false, Technique: false, Custom: true });
    expect(field(tree)!.props.value).toBe('33.5');

    mockStored.barLb = 45;
    reread(tree);

    expect(choices(tree)).toEqual({ Standard: true, "Women's": false, Technique: false, Custom: false });
    expect(field(tree)).toBeUndefined();
  });

  it('ticks Custom and shows the weight when a custom bar was entered elsewhere', () => {
    const tree = mount();
    expect(choices(tree).Standard).toBe(true);

    mockStored.barLb = 40;
    reread(tree);

    expect(choices(tree)).toEqual({ Standard: false, "Women's": false, Technique: false, Custom: true });
    expect(field(tree)!.props.value).toBe('40');
  });

  it('closes a Custom chosen here when another preset is chosen elsewhere, and saves nothing stale on leaving', () => {
    const tree = mount();
    choose(tree, 'Custom');
    expect(choices(tree).Custom).toBe(true);

    mockStored.barLb = 15;
    reread(tree);
    expect(choices(tree)).toEqual({ Standard: false, "Women's": false, Technique: true, Custom: false });

    act(() => flushAll());
    act(() => tree.unmount());
    expect(setSetting).not.toHaveBeenCalled();
    expect(mockStored.barLb).toBe(15);
  });

  it('keeps Custom ticked when the weight typed there matches a preset', () => {
    const tree = mount();
    choose(tree, 'Custom');
    typeKeys(tree, '35');
    act(() => field(tree)!.props.onBlur());
    reread(tree);

    expect(choices(tree)).toEqual({ Standard: false, "Women's": false, Technique: false, Custom: true });
    expect(field(tree)!.props.value).toBe('35');
  });
});
