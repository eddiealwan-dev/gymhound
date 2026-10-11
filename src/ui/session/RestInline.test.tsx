import { View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Button } from '../Button';
import { RestInline } from './RestInline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({ restMinus15: jest.fn(), restSkip: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

let tree: ReactTestRenderer;

beforeEach(() => {
  jest.useFakeTimers();
  act(() => {
    tree = create(<RestInline workoutId="w1" endsAt={Date.now() + 105_000} />);
  });
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

const styleOf = (node: ReactTestInstance) => [node.props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});

/** The box that reads "Rest 1:45". */
const timerBox = () => tree.root.find((n) => n.type === View && n.props.accessibilityRole === 'timer');
/** The row holding the timer box, −15s and Skip. */
const row = () => timerBox().parent!;

describe('the rest under its set fits large text (G1)', () => {
  it('holds the timer, −15s and Skip in one row', () => {
    expect(timerBox().props.accessibilityLabel).toBe('Rest 1:45');
    expect(row().findAllByType(Button).map((b) => b.props.label)).toEqual(['−15s', 'Skip']);
  });

  it('wraps −15s and Skip onto a second line, at the end, when they do not fit beside the time', () => {
    expect(styleOf(row())).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 8 });
    expect(styleOf(row()).rowGap).toEqual(expect.any(Number));
  });

  it('lets the timer box claim the width of its text, so the buttons wrap instead of drawing over it', () => {
    const style = styleOf(timerBox());
    expect(style).toMatchObject({ flexGrow: 1, flexBasis: 'auto', minWidth: 0 });
    // `flex: 1` is a zero basis: the box would never need room, and the row would never wrap.
    expect(style.flex).toBeUndefined();
  });
});
