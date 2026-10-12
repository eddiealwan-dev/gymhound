import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { formatElapsed } from '../domain/dates';
import { useNow, useTicker } from './useNow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]) };
});

let tree: ReactTestRenderer;
let draws = 0;
let shown: string[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(10_000);
  draws = 0;
  shown = [];
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

/** Each look at the clock in its own act, as on the phone, where nothing batches them. */
const lookFor = (ms: number, every = 250) => {
  for (let t = 0; t < ms; t += every) act(() => void jest.advanceTimersByTime(every));
};

function Elapsed({ startedAt, face }: { startedAt: number; face: boolean }) {
  const now = useNow(250, face ? (t) => formatElapsed(t - startedAt) : undefined);
  draws++;
  shown.push(formatElapsed(now - startedAt));
  return null;
}

describe('useNow with a face (R405)', () => {
  it('looks every 250 ms but draws only when the time shown changes', () => {
    // Started 0.9 s into a second: a 1 s clock started now would turn each second over 0.9 s late.
    act(() => void (tree = create(<Elapsed startedAt={9_100} face />)));
    draws = 0;
    shown = [];
    lookFor(3_000);
    expect(draws).toBe(3);
    expect(shown).toEqual(['0:01', '0:02', '0:03']);
  });

  it('turns each second over within 250 ms of it', () => {
    act(() => void (tree = create(<Elapsed startedAt={9_100} face />)));
    // 10.1 s is 1 s after the start: the reading at 10.25 s shows it.
    lookFor(250);
    expect(shown.at(-1)).toBe('0:01');
  });

  it('without a face, draws on every look, as before', () => {
    act(() => void (tree = create(<Elapsed startedAt={9_100} face={false} />)));
    draws = 0;
    lookFor(1_000);
    expect(draws).toBe(4);
  });
});

function Countdown({ endsAt, active }: { endsAt: number; active: boolean }) {
  const now = useTicker(250, (t) => Math.ceil((endsAt - t) / 1000), active);
  draws++;
  shown.push(String(Math.ceil((endsAt - now) / 1000)));
  return null;
}

describe('useTicker (R405)', () => {
  it('draws once a second while active', () => {
    act(() => void (tree = create(<Countdown endsAt={15_000} active />)));
    draws = 0;
    shown = [];
    lookFor(2_000);
    expect(draws).toBe(2);
    expect(shown).toEqual(['4', '3']);
  });

  it('stops looking when it is not active', () => {
    act(() => void (tree = create(<Countdown endsAt={15_000} active={false} />)));
    draws = 0;
    lookFor(5_000);
    expect(draws).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});
