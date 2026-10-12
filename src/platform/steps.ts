import type { StepsSource } from '../domain/steps';

export type { StepsPermission, StepsSource } from '../domain/steps';

/**
 * The step counter, where the platform has one. This is the web (and default) twin: the browser build has no motion
 * sensor, so it is always `unavailable`, the card draws nothing, and the web bundle never includes `expo-sensors`
 * (R182). Phones use `steps.native.ts`.
 */
export function stepsSource(): StepsSource {
  return {
    permission: async () => 'unavailable',
    request: async () => 'unavailable',
    stepsBetween: async () => {
      throw new Error('Steps are not available in the browser.');
    },
  };
}
