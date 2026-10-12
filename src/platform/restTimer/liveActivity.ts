import type { RestTimerSurface } from './index';

/**
 * PHASE 7 (iOS build): the rest timer's Live Activity (R301). The countdown itself runs on the phone
 * (widgets/restTimerActivity.js); this keeps one activity matching the rest:
 * - a tick's start ends any activity left over (a reload or a kill leaves one behind) and starts a new one;
 * - −15s and +15s move its end, keeping when the rest began, so the track keeps its length (§18.6);
 * - Skip, Finish, Discard and the rest being seen over (`ended`) end it at once.
 * An end already gone by starts nothing. Operations run one at a time, in order, as the notification's do (R31).
 */

/** The activity's content: epoch ms. */
export type RestActivityProps = { startedAt: number; endsAt: number };

export interface RestActivityHandle {
  update(props: RestActivityProps, staleDate: Date): Promise<void>;
  end(): Promise<void>;
}

/** The narrow adapter over expo-widgets' `LiveActivityFactory` (`liveActivitySdk.ts`); tests pass a fake. */
export interface RestActivityFactory {
  /** Starts an activity. `staleDate` is the rest's end: past it the activity reads "Rest's up.". */
  start(props: RestActivityProps, staleDate: Date): RestActivityHandle;
  /** Every activity of this kind still on the phone, including ones from before a reload. */
  running(): RestActivityHandle[];
}

export function createLiveActivitySurface(factory: RestActivityFactory, now: () => number = Date.now): RestTimerSurface {
  let current: { handle: RestActivityHandle; startedAt: number } | null = null;
  /** Leftovers from before this launch are ended once, at the first operation. */
  let leftoversEnded = false;
  let queue: Promise<void> = Promise.resolve();

  const inTurn = (operation: () => Promise<void>): Promise<void> => {
    const run = queue.then(operation);
    queue = run.catch(() => {});
    return run;
  };

  async function endAll(): Promise<void> {
    const handles = current ? [current.handle] : [];
    current = null;
    if (!leftoversEnded) {
      leftoversEnded = true;
      for (const handle of factory.running()) if (!handles.includes(handle)) handles.push(handle);
    }
    const results = await Promise.allSettled(handles.map((handle) => handle.end()));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  }

  async function start(endsAt: number): Promise<void> {
    await endAll();
    const startedAt = now();
    if (endsAt <= startedAt) return;
    current = { handle: factory.start({ startedAt, endsAt }, new Date(endsAt)), startedAt };
  }

  async function update(endsAt: number): Promise<void> {
    if (current === null) return start(endsAt);
    if (endsAt <= now()) return endAll();
    await current.handle.update({ startedAt: current.startedAt, endsAt }, new Date(endsAt));
  }

  return {
    start: (endsAt) => inTurn(() => start(endsAt)),
    update: (endsAt) => inTurn(() => update(endsAt)),
    cancel: () => inTurn(endAll),
    ended: () => inTurn(endAll),
  };
}
