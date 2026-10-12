import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { restRemainingSeconds } from '../../domain/rest';
import { msToNextSecond, useRestClock } from './useRestClock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Each draw: the time read and the second shown. */
const draws: { now: number; shown: number | null }[] = [];

function Countdown({ endsAt, stopAt }: { endsAt: number; stopAt: number }) {
  const now = useRestClock(endsAt, stopAt);
  const shown = restRemainingSeconds(endsAt, now);
  draws.push({ now, shown });
  return <Text>{String(shown)}</Text>;
}

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(100_000);
  draws.length = 0;
  tree = undefined;
});

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  jest.useRealTimers();
});

describe('msToNextSecond', () => {
  it('is the time until the rounded-up second changes', () => {
    expect(msToNextSecond(10_000, 0)).toBe(1_000);
    expect(msToNextSecond(10_000, 250)).toBe(750);
    expect(msToNextSecond(10_500, 0)).toBe(500);
    // Past the end it keeps the same beat.
    expect(msToNextSecond(10_000, 10_300)).toBe(700);
  });
});

describe('the rest clock (performance pass)', () => {
  it('draws once a second, as each second turns over, never in between', () => {
    // 5.4 s left: 6 shows, then 5 at 0.4 s, 4 at 1.4 s...
    act(() => {
      tree = create(<Countdown endsAt={105_400} stopAt={105_400} />);
    });
    draws.length = 0;
    act(() => void jest.advanceTimersByTime(399));
    expect(draws).toEqual([]);
    act(() => void jest.advanceTimersByTime(1));
    expect(draws).toEqual([{ now: 100_400, shown: 5 }]);
    // One act per second: React would batch the draws of one act into one.
    for (let i = 0; i < 3; i++) act(() => void jest.advanceTimersByTime(1_000));
    expect(draws.map((d) => d.shown)).toEqual([5, 4, 3, 2]);
    expect(draws.map((d) => d.now)).toEqual([100_400, 101_400, 102_400, 103_400]);
  });

  it('stops at its stop time', () => {
    act(() => {
      tree = create(<Countdown endsAt={102_000} stopAt={102_000} />);
    });
    act(() => void jest.advanceTimersByTime(2_000));
    expect(tree!.toJSON()).toMatchObject({ children: ['null'] });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reads the clock at once for a new end, and keeps to its beat', () => {
    act(() => {
      tree = create(<Countdown endsAt={160_000} stopAt={160_000} />);
    });
    act(() => void jest.advanceTimersByTime(300));
    draws.length = 0;
    act(() => tree!.update(<Countdown endsAt={175_000} stopAt={175_000} />));
    expect(draws[draws.length - 1]).toEqual({ now: 100_300, shown: 75 });
    draws.length = 0;
    act(() => void jest.advanceTimersByTime(700));
    expect(draws).toEqual([{ now: 101_000, shown: 74 }]);
  });
});
