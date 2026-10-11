import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { Db } from '../db/types';
import { bumpData, useFocusedDbQuery } from './dataVersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The screen's focus, driven by the test: the registered focus effect runs on focus and its cleanup on blur. */
let mockFocusEffect: (() => void | (() => void)) | null = null;
let mockBlurCleanup: (() => void) | void = undefined;
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      // As expo-router's: the screen is focused when it mounts, so the effect runs once then.
      mockFocusEffect = effect;
      useEffect(() => {
        mockBlurCleanup = effect();
      }, [effect]);
    },
  };
});
const mockDb = {} as Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));

const blur = () =>
  act(() => {
    if (typeof mockBlurCleanup === 'function') mockBlurCleanup();
    mockBlurCleanup = undefined;
  });
const focus = () =>
  act(() => {
    mockBlurCleanup = mockFocusEffect!();
  });

const query = jest.fn((_db: Db) => 'value');

function Probe() {
  useFocusedDbQuery(query);
  return null;
}

let tree: ReactTestRenderer;

beforeEach(() => {
  query.mockClear();
  mockFocusEffect = null;
  mockBlurCleanup = undefined;
  act(() => {
    tree = create(<Probe />);
  });
});

afterEach(() => act(() => tree.unmount()));

describe('useFocusedDbQuery (R185)', () => {
  it('reads once on mount', () => {
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(mockDb);
  });

  it('reads again on a bump while focused', () => {
    act(() => bumpData());
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not read on a bump while not focused, and reads once on the next focus', () => {
    blur();
    act(() => {
      bumpData();
      bumpData();
    });
    expect(query).toHaveBeenCalledTimes(1);
    focus();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not read again on a focus with no bump', () => {
    blur();
    focus();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps two screens apart: a bump reads the focused one only, and the other catches up on its own focus', () => {
    // The first probe (mounted in beforeEach) is blurred; a second one mounts focused.
    blur();
    const second = jest.fn((_db: Db) => 'second');
    function SecondProbe() {
      useFocusedDbQuery(second);
      return null;
    }
    let other!: ReactTestRenderer;
    act(() => {
      other = create(<SecondProbe />);
    });
    expect(second).toHaveBeenCalledTimes(1);
    act(() => bumpData());
    expect(second).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
    act(() => other.unmount());
  });

  it('reads the newer data when a bump lands between the first render and its subscription', () => {
    // The beforeEach probe is out of sight, so the write below sets no other component's state mid-render.
    blur();
    const late = jest.fn((_db: Db) => 'late');
    let bumped = false;
    function LateProbe() {
      useFocusedDbQuery(late);
      // A write during the first render, before the effects subscribe.
      if (!bumped) {
        bumped = true;
        bumpData();
      }
      return null;
    }
    let other!: ReactTestRenderer;
    act(() => {
      other = create(<LateProbe />);
    });
    expect(late).toHaveBeenCalledTimes(2);
    act(() => other.unmount());
  });
});
