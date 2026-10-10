import { flushAll, registerDraftFlush } from './draftFlush';

describe('draft flush (R29)', () => {
  const cleanups: (() => void)[] = [];
  const register = (flush: () => void) => {
    const unregister = registerDraftFlush(flush);
    cleanups.push(unregister);
    return unregister;
  };

  afterEach(() => {
    cleanups.splice(0).forEach((unregister) => unregister());
    jest.restoreAllMocks();
  });

  it('does nothing when nothing is registered', () => {
    expect(() => flushAll()).not.toThrow();
  });

  it('calls every registered flush once, in the order they registered', () => {
    const calls: string[] = [];
    register(() => calls.push('a'));
    register(() => calls.push('b'));
    register(() => calls.push('c'));

    flushAll();

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('calls them again on the next flushAll: a flush is not consumed', () => {
    const flush = jest.fn();
    register(flush);

    flushAll();
    flushAll();

    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('stops calling a flush once it is unregistered', () => {
    const kept = jest.fn();
    const removed = jest.fn();
    register(kept);
    const unregister = register(removed);

    unregister();
    flushAll();

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it('lets a flush that throws fail alone: the others still run and flushAll does not throw', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const after = jest.fn();
    register(() => {
      throw new Error('boom');
    });
    register(after);

    expect(() => flushAll()).not.toThrow();

    expect(after).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is safe when a flush unregisters itself or another while flushing', () => {
    const later = jest.fn();
    let unregisterSelf = () => {};
    unregisterSelf = register(() => unregisterSelf());
    register(later);

    expect(() => flushAll()).not.toThrow();
    flushAll();

    expect(later).toHaveBeenCalledTimes(2);
  });
});
