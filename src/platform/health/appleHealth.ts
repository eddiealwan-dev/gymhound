import type { SleepSample } from '../../domain/health';
import type { HealthRead, HealthStore } from './types';

/**
 * PHASE 7 (iOS build): Apple Health through `@kingstinct/react-native-healthkit` (16.x), behind `HealthStore`.
 * `HealthKitLike` is the slice of that package GymHound calls, written here because the package is not installed until
 * phase 7; `loadHealthStore` (index.ts) hands in the real module, tests a fake.
 */

/** HealthKit's identifiers (HKObjectType raw values). */
export const HK = {
  workout: 'HKWorkoutTypeIdentifier',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  restingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  bodyMass: 'HKQuantityTypeIdentifierBodyMass',
  steps: 'HKQuantityTypeIdentifierStepCount',
} as const;

/** HKWorkoutActivityType.traditionalStrengthTraining (§17.1). */
export const TRADITIONAL_STRENGTH_TRAINING = 50;

/** HKCategoryValueSleepAnalysis: 0 in bed, 1 asleep (unspecified), 2 awake, 3 core, 4 deep, 5 REM. */
export function sleepKindOf(value: number): SleepSample['kind'] {
  if (value === 0) return 'inBed';
  if (value === 2) return 'awake';
  return 'asleep';
}

type DateFilter = { date: { startDate?: Date; endDate?: Date } };
type Sample = { uuid: string; startDate: Date; endDate: Date };

export type HealthKitLike = {
  isHealthDataAvailableAsync(): Promise<boolean>;
  requestAuthorization(toRequest: { toShare?: readonly string[]; toRead?: readonly string[] }): Promise<boolean>;
  saveWorkoutSample(
    activityType: number,
    quantities: readonly unknown[],
    start: Date,
    end: Date,
    totals?: undefined,
    metadata?: Record<string, string>,
  ): Promise<{ uuid: string }>;
  deleteObjects(identifier: string, filter: { uuid: string }): Promise<number>;
  queryCategorySamples(identifier: string, options: { limit: number; filter?: DateFilter; ascending?: boolean }): Promise<readonly (Sample & { value: number })[]>;
  queryQuantitySamples(
    identifier: string,
    options: { limit: number; unit?: string; filter?: DateFilter; ascending?: boolean },
  ): Promise<readonly (Sample & { quantity: number })[]>;
  queryStatisticsForQuantity(
    identifier: string,
    statistics: readonly 'cumulativeSum'[],
    options?: { unit?: string; filter?: DateFilter },
  ): Promise<{ sumQuantity?: { quantity: number } }>;
};

const READ_TYPES: Record<HealthRead, string> = {
  sleep: HK.sleep,
  heartRate: HK.restingHeartRate,
  bodyweight: HK.bodyMass,
  steps: HK.steps,
};

/** Every sample, not the first page: HealthKit treats a limit of 0 or less as "all". */
const ALL = 0;

export function createAppleHealthStore(hk: HealthKitLike): HealthStore {
  const between = (window: { start: number; end: number }): DateFilter => ({
    date: { startDate: new Date(window.start), endDate: new Date(window.end) },
  });
  return {
    name: 'Apple Health',
    async isAvailable() {
      try {
        return await hk.isHealthDataAvailableAsync();
      } catch {
        return false;
      }
    },
    requestAccess({ writeWorkouts, reads }) {
      return hk.requestAuthorization({
        toShare: writeWorkouts ? [HK.workout] : [],
        toRead: reads.map((read) => READ_TYPES[read]),
      });
    },
    // Apple keeps whether a read was allowed private: a refused read just finds nothing.
    granted: async () => null,
    async writeWorkout(record) {
      // The name goes in as the brand name, which Health shows under the workout; the id lets a delete find it again.
      const saved = await hk.saveWorkoutSample(TRADITIONAL_STRENGTH_TRAINING, [], new Date(record.start), new Date(record.end), undefined, {
        HKExternalUUID: record.workoutId,
        HKWorkoutBrandName: record.title,
      });
      return saved.uuid;
    },
    async deleteWorkout(recordId) {
      await hk.deleteObjects(HK.workout, { uuid: recordId });
    },
    async readSleep(window) {
      const samples = await hk.queryCategorySamples(HK.sleep, { limit: ALL, filter: between(window) });
      return samples.map((s) => ({ start: s.startDate.getTime(), end: s.endDate.getTime(), kind: sleepKindOf(s.value) }));
    },
    async readRestingHeartRate(window) {
      const samples = await hk.queryQuantitySamples(HK.restingHeartRate, { limit: ALL, unit: 'count/min', filter: between(window) });
      return samples.map((s) => ({ at: s.endDate.getTime(), bpm: s.quantity }));
    },
    async readLatestBodyweight() {
      const [latest] = await hk.queryQuantitySamples(HK.bodyMass, { limit: 1, unit: 'kg', ascending: false });
      return latest ? { at: latest.endDate.getTime(), kg: latest.quantity } : null;
    },
    async readSteps(window) {
      // Not used on iPhone (the Pedometer counts steps there, R182). HealthKit's sum counts the watch and the phone once.
      const result = await hk.queryStatisticsForQuantity(HK.steps, ['cumulativeSum'], { unit: 'count', filter: between(window) });
      return Math.round(result.sumQuantity?.quantity ?? 0);
    },
  };
}
