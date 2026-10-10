import { act, create } from 'react-test-renderer';
import { flushAll, useDraftFlush } from './draftFlush';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Input({ flush }: { flush: () => void }) {
  useDraftFlush(flush);
  return null;
}

describe('useDraftFlush (R29)', () => {
  it('registers while mounted, runs the latest render\'s flush, and unregisters on unmount', () => {
    const first = jest.fn();
    const second = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Input flush={first} />);
    });

    // A new render with a newer closure (a draft typed since): the registration is not redone, but the newer flush runs.
    act(() => {
      tree.update(<Input flush={second} />);
    });
    flushAll();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    act(() => {
      tree.unmount();
    });
    flushAll();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('lets several inputs flush together, so one flushAll commits the whole screen', () => {
    const a = jest.fn();
    const b = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <>
          <Input flush={a} />
          <Input flush={b} />
        </>,
      );
    });

    flushAll();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    act(() => {
      tree.unmount();
    });
  });
});
