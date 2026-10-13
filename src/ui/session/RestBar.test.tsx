import { View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { restMinus15, restPlus15, restSkip } from '../../state/sessionActions';
import { Button } from '../Button';
import { RestBar } from './RestBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({ restMinus15: jest.fn(), restPlus15: jest.fn(), restSkip: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

let tree: ReactTestRenderer;
let endsAt: number;

beforeEach(() => {
  jest.useFakeTimers();
  endsAt = Date.now() + 105_000;
  act(() => {
    tree = create(<RestBar workoutId="w1" endsAt={endsAt} bottomInset />);
  });
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

const styleOf = (node: ReactTestInstance) => [node.props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});

describe('the rest bar, for a rest no set row can show (R41)', () => {
  it('has −15s, +15s and Skip as compact outlined pills', () => {
    const buttons = tree.root.findAllByType(Button);
    expect(buttons.map((b) => b.props.label)).toEqual(['−15s', '+15s', 'Skip']);
    for (const b of buttons) expect(b.props).toMatchObject({ size: 'compact', variant: 'secondary' });
  });

  it('+15s adds 15 seconds to this rest, and the others still work', () => {
    const [minus, plus, skip] = tree.root.findAllByType(Button);
    act(() => plus.props.onPress());
    act(() => minus.props.onPress());
    act(() => skip.props.onPress());

    expect(restPlus15).toHaveBeenCalledWith('db', 'w1', endsAt);
    expect(restMinus15).toHaveBeenCalledWith('db', 'w1', endsAt);
    expect(restSkip).toHaveBeenCalledWith('db', 'w1', endsAt);
  });

  it('wraps its row with large text', () => {
    const rowWithPills = tree.root.find((n) => n.type === View && n.findAllByType(Button).length === 3 && styleOf(n).flexDirection === 'row');
    expect(styleOf(rowWithPills).flexWrap).toBe('wrap');
  });

  it('reads the time left to VoiceOver as a duration, not a clock (B9)', () => {
    const [timer] = tree.root.findAll((n) => n.props.accessibilityRole === 'timer');
    expect(timer.props.accessibilityLabel).toBe('Rest, 1 minute 45 seconds left');
  });

  it('has no tap-to-change: its set is gone', () => {
    expect(tree.root.findAll((n) => n.props.accessibilityHint === 'Changes the rest time')).toHaveLength(0);
  });
});
