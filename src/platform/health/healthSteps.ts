import type { StepsPermission, StepsSource } from '../../domain/steps';
import type { HealthStore } from './types';

/**
 * PHASE 7 (Android build): the Stats steps card's source on Android, from Health Connect (§18.3, R182, R312). The
 * phone's own step counter is what the iPhone reads (steps.native.ts); Android has no such sensor API, so the steps
 * come from Health Connect, which the phone and any watch already write to. Asking happens only through `request()`,
 * from the card's **Show steps**, as on the iPhone.
 */
export function healthConnectSteps(store: HealthStore): StepsSource {
  const answer = async (ask: () => Promise<boolean | null>): Promise<StepsPermission> => {
    try {
      if (!(await store.isAvailable())) return 'unavailable';
      const allowed = await ask();
      return allowed === true ? 'granted' : allowed === false ? 'denied' : 'undetermined';
    } catch {
      return 'unavailable';
    }
  };
  return {
    // Health Connect cannot say "not asked yet" apart from "refused", so a read not allowed reads as not yet asked:
    // the card keeps offering Show steps, and Health Connect itself stops showing the sheet after two refusals.
    permission: async () => {
      const state = await answer(() => store.granted('steps'));
      return state === 'denied' ? 'undetermined' : state;
    },
    request: () =>
      answer(async () => {
        await store.requestAccess({ writeWorkouts: false, reads: ['steps'] });
        return store.granted('steps');
      }),
    stepsBetween: (start, end) => store.readSteps({ start: start.getTime(), end: end.getTime() }),
  };
}
