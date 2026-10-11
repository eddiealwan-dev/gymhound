import { Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { setSetting } from '../db/repositories/settingsRepo';
import { bumpData } from '../state/dataVersion';
import { flushAll } from '../state/draftFlush';
import { PlatesEditor } from './PlatesEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The stored settings the editor reads. A write through `setSetting` lands here, as it would in SQLite. */
const mockStored: { unit: string; platesLb: Record<string, number>; platesKg: Record<string, number> } = {
  unit: 'lb',
  platesLb: {},
  platesKg: {},
};

jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ ...mockStored }),
  defaultSettings: () => ({
    platesLb: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 },
    platesKg: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 },
  }),
  setSetting: jest.fn((_db: unknown, key: 'platesLb' | 'platesKg', value: Record<string, number>) => {
    mockStored[key] = value;
  }),
}));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: unknown) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const DEFAULT_LB = { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 };

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<PlatesEditor />);
  });
  return tree;
}

/** Draws the editor again from what is stored now, as a bump does. */
function reread(tree: ReactTestRenderer) {
  act(() => tree.update(<PlatesEditor />));
}

/** The adjustable row for a size, by its VoiceOver label ("45 lb plates"). */
function row(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll((n) => n.props.accessibilityRole === 'adjustable' && n.props.accessibilityLabel === label)[0];
}

/** A stepper button by its label ("Add a pair of 45 lb" / "Remove a pair of 45 lb"). */
function stepper(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll((n) => (n.props.accessibilityLabel === label || n.props.label === label) && typeof n.props.onPress === 'function')[0];
}

function press(tree: ReactTestRenderer, label: string) {
  act(() => stepper(tree, label).props.onPress());
  reread(tree);
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

const sizeField = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === 'Add a plate size, lb')!;

function typeAndSubmit(tree: ReactTestRenderer, text: string) {
  act(() => sizeField(tree).props.onChangeText(text));
  act(() => sizeField(tree).props.onSubmitEditing());
  reread(tree);
}

beforeEach(() => {
  mockStored.unit = 'lb';
  mockStored.platesLb = { ...DEFAULT_LB };
  mockStored.platesKg = { '25': 4 };
  jest.mocked(setSetting).mockClear();
  jest.mocked(bumpData).mockClear();
});

describe('PlatesEditor (Task 5, R107)', () => {
  it('lists each standard size for the display unit with its pairs, and the helper line', () => {
    const tree = mount();
    expect(texts(tree)).toContain('Pairs you own, for the plate calculator and barbell rounding.');
    expect(row(tree, '45 lb plates').props.accessibilityValue).toEqual({ text: '4 pairs' });
    expect(row(tree, '15 lb plates').props.accessibilityValue).toEqual({ text: '0 pairs' });
    expect(row(tree, '35 lb plates').props.accessibilityValue).toEqual({ text: '1 pair' });
    expect(texts(tree)).toContain('45 lb');
  });

  it('adds a pair of 45s, saving 5 pairs and bumping', () => {
    const tree = mount();
    press(tree, 'Add a pair of 45 lb');
    expect(setSetting).toHaveBeenLastCalledWith('db', 'platesLb', { ...DEFAULT_LB, '45': 5 });
    expect(bumpData).toHaveBeenCalled();
    expect(row(tree, '45 lb plates').props.accessibilityValue).toEqual({ text: '5 pairs' });
  });

  it('takes a size to 0 and drops it from what is stored', () => {
    const tree = mount();
    press(tree, 'Remove a pair of 35 lb');
    expect(mockStored.platesLb).not.toHaveProperty('35');
  });

  it('adjusts with VoiceOver: increment and decrement', () => {
    const tree = mount();
    act(() => row(tree, '45 lb plates').props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    reread(tree);
    expect(mockStored.platesLb['45']).toBe(5);
    act(() => row(tree, '45 lb plates').props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(mockStored.platesLb['45']).toBe(4);
  });

  it('stops at 20 pairs', () => {
    mockStored.platesLb = { '45': 20 };
    const tree = mount();
    expect(stepper(tree, 'Add a pair of 45 lb').props.disabled).toBe(true);
  });

  it("can't remove the last pair: its minus is disabled, with the line saying why", () => {
    mockStored.platesLb = { '45': 1 };
    const tree = mount();
    expect(stepper(tree, 'Remove a pair of 45 lb').props.disabled).toBe(true);
    expect(texts(tree)).toContain('Keep at least one pair.');
    act(() => row(tree, '45 lb plates').props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(setSetting).not.toHaveBeenCalled();
    expect(mockStored.platesLb).toEqual({ '45': 1 });
  });

  it('hides the line while more than one pair is owned', () => {
    const tree = mount();
    expect(texts(tree)).not.toContain('Keep at least one pair.');
  });

  it('adds a size of your own with one pair, in its place', () => {
    const tree = mount();
    expect(sizeField(tree).props.keyboardType).toBe('decimal-pad');
    expect(sizeField(tree).props.returnKeyType).toBe('done');
    typeAndSubmit(tree, '7,5');
    expect(mockStored.platesLb['7.5']).toBe(1);
    expect(row(tree, '7.5 lb plates').props.accessibilityValue).toEqual({ text: '1 pair' });
    expect(sizeField(tree).props.value).toBe('');
  });

  it('shows "Check this number" for a size it can\'t take, and writes nothing', () => {
    const tree = mount();
    typeAndSubmit(tree, '101');
    expect(texts(tree)).toContain('Check this number');
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('does nothing for a size already listed', () => {
    const tree = mount();
    typeAndSubmit(tree, '15');
    expect(setSetting).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain('Check this number');
    expect(sizeField(tree).props.value).toBe('');
  });

  it('adds a typed size when drafts are flushed (R29)', () => {
    const tree = mount();
    act(() => sizeField(tree).props.onChangeText('3'));
    act(() => flushAll());
    expect(mockStored.platesLb['3']).toBe(1);
  });

  it('resets to the defaults for the unit', () => {
    mockStored.platesLb = { '45': 1 };
    const tree = mount();
    press(tree, 'Reset to defaults');
    expect(mockStored.platesLb).toEqual(DEFAULT_LB);
  });

  it('edits the kg plates when the display unit is kg', () => {
    mockStored.unit = 'kg';
    const tree = mount();
    press(tree, 'Add a pair of 1.25 kg');
    expect(setSetting).toHaveBeenLastCalledWith('db', 'platesKg', { '25': 4, '1.25': 1 });
    expect(mockStored.platesLb).toEqual(DEFAULT_LB);
  });
});
