import { Keyboard, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { foodOfferDue } from '../../db/repositories/foodOfferRepo';
import { flushAll } from '../../state/draftFlush';
import { acceptFoodOffer, dismissFoodOffer } from '../../state/sessionActions';
import { FoodOfferBanner } from './FoodOfferBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPro = true;
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../platform/entitlements', () => ({ useIsPro: () => mockPro }));
jest.mock('../../db/repositories/foodOfferRepo', () => ({ foodOfferDue: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({ acceptFoodOffer: jest.fn(), dismissFoodOffer: jest.fn() }));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: (query: (db: unknown) => unknown) => query('db') }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const COPY = 'Protein is behind today. Mark this session Short on food?';

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FoodOfferBanner workoutId="w1" />);
  });
  return tree;
}

const lines = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => ([] as unknown[]).concat(n.props.children).join(''));
const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((n) => typeof n.props.onPress === 'function' && (n.props.accessibilityLabel === label || n.props.label === label));

beforeEach(() => {
  mockPro = true;
  jest.mocked(foodOfferDue).mockReset().mockReturnValue(true);
  jest.mocked(acceptFoodOffer).mockClear();
  jest.mocked(dismissFoodOffer).mockClear();
  jest.mocked(flushAll).mockClear();
});

describe('FoodOfferBanner (§7.10)', () => {
  it('shows the line, Mark it and a Dismiss × when the offer is due', () => {
    const tree = mount();
    expect(lines(tree)).toEqual([COPY, 'Mark it']);
    expect(pressable(tree, 'Mark it')).toBeTruthy();
    expect(pressable(tree, 'Dismiss')).toBeTruthy();
    expect(foodOfferDue).toHaveBeenCalledWith('db', 'w1', true);
  });

  it('asks with Pro as it is now, and shows nothing when the offer is not due', () => {
    mockPro = false;
    jest.mocked(foodOfferDue).mockImplementation((_db, _id, isPro) => isPro);
    const tree = mount();
    expect(foodOfferDue).toHaveBeenCalledWith('db', 'w1', false);
    expect(tree.toJSON()).toBeNull();
  });

  it('Mark it saves what is typed, puts the keyboard away, then marks the workout', () => {
    const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');
    const tree = mount();
    act(() => pressable(tree, 'Mark it').props.onPress());
    expect(flushAll).toHaveBeenCalled();
    expect(dismissKeyboard).toHaveBeenCalled();
    expect(acceptFoodOffer).toHaveBeenCalledWith('db', 'w1');
    expect(jest.mocked(flushAll).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(acceptFoodOffer).mock.invocationCallOrder[0]);
    expect(dismissFoodOffer).not.toHaveBeenCalled();
    dismissKeyboard.mockRestore();
  });

  it('× saves what is typed, then dismisses the offer without marking', () => {
    const tree = mount();
    act(() => pressable(tree, 'Dismiss').props.onPress());
    expect(flushAll).toHaveBeenCalled();
    expect(dismissFoodOffer).toHaveBeenCalledWith('db', 'w1');
    expect(jest.mocked(flushAll).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(dismissFoodOffer).mock.invocationCallOrder[0]);
    expect(acceptFoodOffer).not.toHaveBeenCalled();
  });

  it('gives the × a 44pt target and the screen reader a button named Dismiss', () => {
    const tree = mount();
    const x = pressable(tree, 'Dismiss');
    expect(x.props.accessibilityRole).toBe('button');
    const style = typeof x.props.style === 'function' ? x.props.style({ pressed: false }) : x.props.style;
    expect(style).toMatchObject({ width: 44, height: 44 });
  });

  it('adds no top safe-area padding: it sits under the session header', () => {
    const tree = mount();
    const root = tree.toJSON() as unknown as { props: { style: Record<string, unknown> } };
    expect(root.props.style.paddingTop ?? 0).toBe(0);
  });

  it('never uses the red', () => {
    const tree = mount();
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });
});
