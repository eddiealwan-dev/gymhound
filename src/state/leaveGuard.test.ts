import { leaveGuarded, setLeaveGuard } from './leaveGuard';

describe('leaveGuarded (the dock and the header, R89)', () => {
  it('leaves at once when no screen guards', () => {
    const leave = jest.fn();
    leaveGuarded(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('hands the move to the guard, which may take it over (ask first) or let it go now', () => {
    const leave = jest.fn();
    let takeOver = true;
    const guard = jest.fn(() => takeOver);
    const remove = setLeaveGuard(guard);

    leaveGuarded(leave);
    expect(guard).toHaveBeenCalledWith(leave);
    expect(leave).not.toHaveBeenCalled();

    takeOver = false;
    leaveGuarded(leave);
    expect(leave).toHaveBeenCalledTimes(1);
    remove();
  });

  it('removing a guard stops it, and never removes a newer one', () => {
    const first = jest.fn(() => true);
    const second = jest.fn(() => true);
    const removeFirst = setLeaveGuard(first);
    const removeSecond = setLeaveGuard(second);

    removeFirst();
    const leave = jest.fn();
    leaveGuarded(leave);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();

    removeSecond();
    leaveGuarded(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
