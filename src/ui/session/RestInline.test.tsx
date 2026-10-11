import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { restMinus15, restPlus15, restSkip } from '../../state/sessionActions';
import { Button } from '../Button';
import { RestInline } from './RestInline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({ restMinus15: jest.fn(), restPlus15: jest.fn(), restSkip: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

let tree: ReactTestRenderer;
let endsAt: number;
const onOpenRest = jest.fn();

function mount(at: number, upText = "Rest's up · Set 2 next") {
  endsAt = at;
  act(() => {
    tree = create(<RestInline workoutId="w1" endsAt={endsAt} lengthSeconds={120} upText={upText} onOpenRest={onOpenRest} />);
  });
}

/** Draws the row again with new props, as the block does when the workout changes. */
function rerender(props: { endsAt?: number; lengthSeconds?: number }) {
  endsAt = props.endsAt ?? endsAt;
  act(() => {
    tree.update(
      <RestInline workoutId="w1" endsAt={endsAt} lengthSeconds={props.lengthSeconds ?? 120} upText="Rest's up · Set 2 next" onOpenRest={onOpenRest} />,
    );
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  onOpenRest.mockClear();
  jest.mocked(restMinus15).mockClear();
  jest.mocked(restPlus15).mockClear();
  jest.mocked(restSkip).mockClear();
  mount(Date.now() + 105_000);
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

const track = () => tree.root.find((n) => n.type === View && n.props.accessibilityElementsHidden === true);

const styleOf = (node: ReactTestInstance) => [node.props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});

/** The time box: the button that reads "Rest 1:45" and opens the rest choices. */
const timerBox = () =>
  tree.root.find(
    (n) => n.type === View && n.props.accessibilityRole === 'button' && String(n.props.accessibilityLabel ?? '').startsWith('Rest '),
  );
/** The row holding the time box, −15s, +15s and Skip. */
const row = () => tree.root.find((n) => n.type === View && styleOf(n).flexWrap === 'wrap');
/** Every string drawn on screen right now. */
const shownText = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

describe('the rest under its set is a live timer (spec 18.6)', () => {
  it('shows a big countdown under a REST label', () => {
    const time = tree.root.find((n) => n.type === Text && n.props.children === '1:45');
    expect(styleOf(time)).toMatchObject({ fontSize: 32, fontFamily: 'BarlowCondensed_800ExtraBold' });
    expect(shownText()).toContain('REST');
    expect(timerBox().props.accessibilityLabel).toBe('Rest 1:45');
  });

  it('has −15s, +15s and Skip as compact outlined pills', () => {
    const buttons = row().findAllByType(Button);
    expect(buttons.map((b) => b.props.label)).toEqual(['−15s', '+15s', 'Skip']);
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
      'Take 15 seconds off the rest',
      'Add 15 seconds to the rest',
      'Skip the rest',
    ]);
    for (const b of buttons) expect(b.props).toMatchObject({ size: 'compact', variant: 'secondary' });

    act(() => buttons[0].props.onPress());
    act(() => buttons[1].props.onPress());
    act(() => buttons[2].props.onPress());

    expect(restMinus15).toHaveBeenCalledWith('db', 'w1', endsAt);
    expect(restPlus15).toHaveBeenCalledWith('db', 'w1', endsAt);
    expect(restSkip).toHaveBeenCalledWith('db', 'w1', endsAt);
  });

  it('drains a text-colour track', () => {
    const track = tree.root.find((n) => n.type === View && n.props.accessibilityElementsHidden === true);
    expect(styleOf(track)).toMatchObject({ position: 'absolute', left: 0, bottom: 0, height: 3, width: '87.5%', backgroundColor: '#f1ece2' });
    expect(track.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('never looks like a done set', () => {
    const style = styleOf(row());
    expect(style.backgroundColor).toBe('#1a1814');
    expect(style.backgroundColor).not.toBe('#232019');
    expect(style).toMatchObject({ borderWidth: 1, borderColor: '#736c60', overflow: 'hidden' });
  });

  it('tapping the time opens the rest choices', () => {
    expect(timerBox().props.accessibilityHint).toBe('Changes the rest time');

    const pressable = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Rest 1:45')[0];
    act(() => pressable.props.onPress());

    expect(onOpenRest).toHaveBeenCalledTimes(1);
  });

  it('keeps the length the rest started with: a new rest length chosen from the countdown does not rescale its track', () => {
    expect(styleOf(track()).width).toBe('87.5%');

    rerender({ lengthSeconds: 210 });

    expect(styleOf(track()).width).toBe('87.5%');
  });

  it('+15s may still fill the track', () => {
    rerender({ endsAt: endsAt + 15_000 });
    expect(styleOf(track()).width).toBe('100%');
  });

  it("keeps the running row's height through Rest's up, so the sets below do not jump at zero", () => {
    act(() => tree.unmount());
    mount(Date.now() + 1_000);
    act(() => row().props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 71 } } }));

    advance(2_000);

    expect(shownText()).toContain("Rest's up · Set 2 next");
    expect(styleOf(row()).minHeight).toBe(71);
  });

  it("holds Rest's up for 10 seconds at zero", () => {
    act(() => tree.unmount());
    mount(Date.now() + 1_000);

    // One second after the end.
    advance(2_000);
    expect(shownText()).toContain("Rest's up · Set 2 next");
    expect(tree.root.findAllByType(Button)).toHaveLength(0);
    expect(tree.root.findAll((n) => n.props.name === 'checkmark-circle' && n.props.color === '#f1ece2' && n.props.size === 20)).not.toHaveLength(0);

    // Ten seconds after the end.
    advance(9_000);
    expect(tree.toJSON()).toBeNull();
    // Its clock has stopped.
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('the rest under its set fits large text (G1)', () => {
  it('wraps the pills onto a second line, at the end, when they do not fit beside the time', () => {
    expect(styleOf(row())).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 8 });
    // The pills' 4pt hitSlops, stacked, must not overlap.
    expect(styleOf(row()).rowGap).toBe(8);
  });

  it('wraps −15s, +15s and Skip together, never Skip alone', () => {
    const pills = row().findAll((n) => n.type === View && styleOf(n).flexWrap !== 'wrap' && n.findAllByType(Button).length === 3);
    expect(pills).toHaveLength(1);
    expect(styleOf(pills[0])).toMatchObject({ flexDirection: 'row', flexShrink: 0, columnGap: 8 });
  });

  it('lets the time box claim the width of its text, so the pills wrap instead of drawing over it', () => {
    const style = styleOf(timerBox());
    expect(style).toMatchObject({ flexGrow: 1, flexBasis: 'auto', minWidth: 0 });
    // `flex: 1` is a zero basis: the box would never need room, and the row would never wrap.
    expect(style.flex).toBeUndefined();
  });
});
