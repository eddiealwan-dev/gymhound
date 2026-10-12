import type { HealthBodyweight, HealthWorkoutRecord, HeartRateSample, SleepSample, Span } from '../../domain/health';

/**
 * PHASE 7: the phone's health store behind one interface (spec §17.1, R307): Apple Health on iPhone
 * (`appleHealth.ts`), Health Connect on Android (`healthConnect.ts`). `getHealthStore()` (index.ts) is null in Expo Go
 * and on the web, and wherever the store's package is not in the build, and every caller then does what it does today.
 */

/** What GymHound may read, each switched on separately in Settings. `steps` is the Android pedometer (§18.3, R182). */
export type HealthRead = 'sleep' | 'heartRate' | 'bodyweight' | 'steps';

export type HealthAccess = { writeWorkouts: boolean; reads: HealthRead[] };

export interface HealthStore {
  readonly name: 'Apple Health' | 'Health Connect';
  /** Whether the store exists on this phone (Health Connect may be missing or need an update). Never throws. */
  isAvailable(): Promise<boolean>;
  /**
   * Shows the store's permission sheet for what is asked. Resolves true when the sheet was answered. Apple never says
   * whether a read was allowed (a refused read just reads empty), so true is not "granted".
   */
  requestAccess(access: HealthAccess): Promise<boolean>;
  /** Whether a read was allowed: true or false on Health Connect; null on Apple Health, which never says. */
  granted(read: HealthRead): Promise<boolean | null>;
  /** Writes one strength session. Resolves with the store's id for it. */
  writeWorkout(record: HealthWorkoutRecord): Promise<string>;
  /** Removes a session GymHound wrote, by the id `writeWorkout` gave. */
  deleteWorkout(recordId: string): Promise<void>;
  readSleep(window: Span): Promise<SleepSample[]>;
  readRestingHeartRate(window: Span): Promise<HeartRateSample[]>;
  /** The newest body weight, or null. */
  readLatestBodyweight(): Promise<HealthBodyweight | null>;
  readSteps(window: Span): Promise<number>;
}
