/**
 * A screen holding unsaved work (the routine editor, R89) can stop the dock and the header from leaving it without
 * asking. The guard gets the move it interrupted and returns true when it takes it over (it asks first, and makes the
 * move only if the answer is to go), or false to let the move happen now. One screen guards at a time: the focused one.
 */
type LeaveGuard = (leave: () => void) => boolean;

let current: LeaveGuard | null = null;

/** Guards until the returned function is called. Removing a guard never removes a newer one. */
export function setLeaveGuard(guard: LeaveGuard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

/** Leaves by `leave`, unless the screen being left takes the move over to ask first. */
export function leaveGuarded(leave: () => void): void {
  if (current?.(leave)) return;
  leave();
}
