import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { useRestUp } from './useRestUp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Input = { restEndsAt: number | null; restSetId: string | null; doneCount: number };

/** What the hook returned on the last render. */
let held: ReturnType<typeof useRestUp> = null;
/** What the hook returned on every render, in order, including a render React redoes before it commits. */
let renders: ReturnType<typeof useRestUp>[] = [];

function Probe({ restEndsAt, restSetId, doneCount }: Input) {
  held = useRestUp(restEndsAt, restSetId, doneCount);
  renders.push(held);
  return null;
}

const NOW = 1_000_000_000_000;
const E = NOW + 5_000;
let tree: ReactTestRenderer;

function mount(input: Input) {
  act(() => {
    tree = create(<Probe {...input} />);
  });
}

function update(input: Input) {
  act(() => tree.update(<Probe {...input} />));
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  held = null;
  renders = [];
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe("useRestUp: the rest that just ran out, held for its Rest's up (spec 18.6)", () => {
  it('holds a rest that ran out', () => {
    mount({ restEndsAt: E, restSetId: 's1', doneCount: 1 });
    expect(held).toBeNull();

    jest.setSystemTime(E);
    update({ restEndsAt: null, restSetId: null, doneCount: 1 });

    expect(held).toEqual({ setId: 's1', endsAt: E });
  });

  it('hands over from the running rest to the hold in the same render, so no frame is drawn without the row', () => {
    mount({ restEndsAt: E, restSetId: 's1', doneCount: 1 });
    jest.setSystemTime(E);
    renders = [];

    // The watcher clears the end at zero: the row, which drew the running rest, must draw the hold in the same render.
    update({ restEndsAt: null, restSetId: null, doneCount: 1 });

    expect(renders.length).toBeGreaterThan(0);
    expect(renders).toEqual(renders.map(() => ({ setId: 's1', endsAt: E })));
  });

  it('holds nothing after Skip, even once the old end passes', () => {
    mount({ restEndsAt: E, restSetId: 's1', doneCount: 1 });

    jest.setSystemTime(E - 1);
    update({ restEndsAt: null, restSetId: null, doneCount: 1 });
    expect(held).toBeNull();

    jest.setSystemTime(E + 1_000);
    update({ restEndsAt: null, restSetId: null, doneCount: 1 });
    expect(held).toBeNull();
  });

  it('a tick drops the hold', () => {
    mount({ restEndsAt: E, restSetId: 's1', doneCount: 1 });
    jest.setSystemTime(E);
    update({ restEndsAt: null, restSetId: null, doneCount: 1 });
    expect(held).not.toBeNull();

    update({ restEndsAt: null, restSetId: null, doneCount: 2 });

    expect(held).toBeNull();
  });

  it('a new rest replaces the hold', () => {
    mount({ restEndsAt: E, restSetId: 's1', doneCount: 1 });
    jest.setSystemTime(E);
    update({ restEndsAt: null, restSetId: null, doneCount: 1 });
    expect(held).not.toBeNull();

    update({ restEndsAt: E + 120_000, restSetId: 's2', doneCount: 1 });

    expect(held).toBeNull();
  });
});
