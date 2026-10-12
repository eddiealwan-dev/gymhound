import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { StartupError } from './StartupError';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));
const mockShare = jest.fn((_path: string) => Promise.resolve());
jest.mock('../state/backup', () => ({ shareFile: (path: string) => mockShare(path) }));
jest.mock('../platform/announce', () => ({ focusOn: jest.fn() }));

const DAMAGED = new Error("None of GymHound's backups on this phone could be read.");
const QUESTION = 'Start with no data? The damaged files are kept in a folder on this phone, in case they can be recovered.';

function mount(props: Partial<Parameters<typeof StartupError>[0]> = {}): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<StartupError error={DAMAGED} exports={{ snapshot: '/snap/a.db', failed: null }} {...props} />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => ([] as unknown[]).concat(t.props.children).join(''));
/** The pressable buttons, one node each. */
const pressables = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.parent?.props.accessibilityRole !== 'button');
const buttons = (tree: ReactTestRenderer) => pressables(tree).map((p) => p.props.accessibilityLabel as string);
const press = (tree: ReactTestRenderer, label: string) => {
  const found = pressables(tree).filter((p) => p.props.accessibilityLabel === label);
  expect(found).toHaveLength(1);
  act(() => found[0].props.onPress());
};

describe('StartupError: Start fresh when every backup is damaged and there is no live data (R421)', () => {
  it('keeps the error text and offers no Start fresh unless the startup allows it (§12)', () => {
    const tree = mount();
    expect(texts(tree)).toEqual(expect.arrayContaining(["GymHound couldn't update its database.", DAMAGED.message]));
    expect(buttons(tree)).toEqual(['Export my data']);
  });

  it('offers Start fresh under the exports, and asks first', () => {
    const onStartFresh = jest.fn();
    const tree = mount({ onStartFresh });
    expect(buttons(tree)).toEqual(['Export my data', 'Start fresh']);

    press(tree, 'Start fresh');

    expect(onStartFresh).not.toHaveBeenCalled();
    expect(texts(tree)).toEqual(expect.arrayContaining([DAMAGED.message, QUESTION]));
    expect(buttons(tree)).toEqual(['Export my data', 'Start fresh', 'Cancel']);
  });

  it('Cancel goes back without starting', () => {
    const onStartFresh = jest.fn();
    const tree = mount({ onStartFresh });
    press(tree, 'Start fresh');

    press(tree, 'Cancel');

    expect(onStartFresh).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain(QUESTION);
    expect(buttons(tree)).toEqual(['Export my data', 'Start fresh']);
  });

  it('Start fresh in the question starts with no data', () => {
    const onStartFresh = jest.fn();
    const tree = mount({ onStartFresh });
    press(tree, 'Start fresh');

    press(tree, 'Start fresh');

    expect(onStartFresh).toHaveBeenCalledTimes(1);
  });

  it('every button is at least 44pt tall', () => {
    const tree = mount({ onStartFresh: jest.fn() });
    press(tree, 'Start fresh');
    for (const p of pressables(tree)) {
      const style = typeof p.props.style === 'function' ? p.props.style({ pressed: false }) : p.props.style;
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});
