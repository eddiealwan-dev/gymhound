import { Platform } from 'react-native';
import type { StepsPermission, StepsSource } from '../domain/steps';

export type { StepsPermission, StepsSource } from '../domain/steps';

type Pedometer = typeof import('expo-sensors').Pedometer;

/** The source on a phone with no step counter GymHound reads: Android (Health Connect, phase 7) and an iPhone without one. */
const unavailable: StepsSource = {
  permission: async () => 'unavailable',
  request: async () => 'unavailable',
  stepsBetween: async () => {
    throw new Error('Steps are not available on this phone.');
  },
};

function toPermission(status: string): StepsPermission {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * The iPhone's step counter through `expo-sensors`' Pedometer (R182), which runs in Expo Go. This is the only file that
 * names `expo-sensors`, and only inside `stepsSource` on iOS, so Android never loads it and the web bundle (`steps.ts`)
 * never includes it. A phone without a counter, or a sensor that fails to answer, is `unavailable`: the card draws
 * nothing and nothing throws. Motion access is asked only by `request()`; nothing is stored.
 */
export function stepsSource(): StepsSource {
  if (Platform.OS !== 'ios') return unavailable;
  let pedometer: Pedometer;
  try {
    pedometer = (require('expo-sensors') as typeof import('expo-sensors')).Pedometer;
  } catch {
    return unavailable;
  }
  const ask = async (read: () => Promise<{ status: string }>): Promise<StepsPermission> => {
    try {
      if (!(await pedometer.isAvailableAsync())) return 'unavailable';
      return toPermission((await read()).status);
    } catch {
      return 'unavailable';
    }
  };
  return {
    permission: () => ask(() => pedometer.getPermissionsAsync()),
    request: () => ask(() => pedometer.requestPermissionsAsync()),
    async stepsBetween(start, end) {
      const { steps } = await pedometer.getStepCountAsync(start, end);
      return steps;
    },
  };
}
