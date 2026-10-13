import type { SleepSample } from '../../domain/health';
import type { HealthRead, HealthStore } from './types';

/**
 * PHASE 7 (Android build): Health Connect through `react-native-health-connect` (4.x), behind `HealthStore`.
 * `HealthConnectLike` is the slice of that package GymHound calls, written here because the package is not installed
 * until phase 7; `loadHealthStore` (index.ts) hands in the real module, tests a fake.
 */

/** ExerciseType.STRENGTH_TRAINING (§17.1). */
export const EXERCISE_STRENGTH_TRAINING = 70;
/** SdkAvailabilityStatus.SDK_AVAILABLE. */
export const SDK_AVAILABLE = 3;

/** SleepStageType: 0 unknown, 1 awake, 2 sleeping, 3 out of bed, 4 light, 5 deep, 6 REM. */
export function sleepStageKind(stage: number): SleepSample['kind'] | null {
  if (stage === 1 || stage === 3) return 'awake';
  if (stage === 2 || stage === 4 || stage === 5 || stage === 6) return 'asleep';
  return null;
}

type TimeRangeFilter = { operator: 'between'; startTime: string; endTime: string };
type Permission = { accessType: 'read' | 'write'; recordType: string };

type ExerciseSession = {
  recordType: 'ExerciseSession';
  exerciseType: number;
  title?: string;
  startTime: string;
  endTime: string;
  metadata?: { clientRecordId?: string };
};

export type HealthConnectLike = {
  getSdkStatus(): Promise<number>;
  initialize(): Promise<boolean>;
  requestPermission(permissions: Permission[]): Promise<Permission[]>;
  getGrantedPermissions(): Promise<Permission[]>;
  insertRecords(records: ExerciseSession[]): Promise<string[]>;
  deleteRecordsByUuids(recordType: string, recordIds: string[], clientRecordIds: string[]): Promise<void>;
  readRecords(
    recordType: string,
    options: { timeRangeFilter: TimeRangeFilter; ascendingOrder?: boolean; pageSize?: number },
  ): Promise<{ records: unknown[] }>;
  aggregateRecord(request: { recordType: 'Steps'; timeRangeFilter: TimeRangeFilter }): Promise<{ COUNT_TOTAL?: number }>;
};

type SleepSession = { startTime: string; endTime: string; stages?: { startTime: string; endTime: string; stage: number }[] };
type RestingHeartRate = { time: string; beatsPerMinute: number };
type Weight = { time: string; weight: { inKilograms?: number; value?: number; unit?: string } };

const READ_RECORDS: Record<HealthRead, string> = {
  sleep: 'SleepSession',
  heartRate: 'RestingHeartRate',
  bodyweight: 'Weight',
  steps: 'Steps',
};

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (time: string) => new Date(time).getTime();
const range = (window: { start: number; end: number }): TimeRangeFilter => ({
  operator: 'between',
  startTime: iso(window.start),
  endTime: iso(window.end),
});

/** A weight record's kilograms, whichever way the module reports the mass. */
function kilograms(weight: Weight['weight']): number | null {
  if (typeof weight.inKilograms === 'number') return weight.inKilograms;
  if (typeof weight.value !== 'number') return null;
  if (weight.unit === 'kilograms') return weight.value;
  if (weight.unit === 'pounds') return weight.value * 0.45359237;
  if (weight.unit === 'grams') return weight.value / 1000;
  return null;
}

/** How far back the newest body weight is looked for. */
const BODYWEIGHT_LOOKBACK_MS = 90 * 24 * 3_600_000;

export function createHealthConnectStore(hc: HealthConnectLike, now: () => number = Date.now): HealthStore {
  let ready: Promise<boolean> | null = null;
  /** Health Connect must be initialized once before any other call. A failure is tried again next time. */
  const initialized = async () => {
    ready ??= hc.initialize().catch(() => false);
    if (!(await ready)) {
      ready = null;
      throw new Error('Health Connect is not available.');
    }
  };
  return {
    name: 'Health Connect',
    async isAvailable() {
      try {
        if ((await hc.getSdkStatus()) !== SDK_AVAILABLE) return false;
        await initialized();
        return true;
      } catch {
        return false;
      }
    },
    async requestAccess({ writeWorkouts, reads }) {
      await initialized();
      const permissions: Permission[] = [
        ...(writeWorkouts ? [{ accessType: 'write' as const, recordType: 'ExerciseSession' }] : []),
        ...reads.map((read) => ({ accessType: 'read' as const, recordType: READ_RECORDS[read] })),
      ];
      if (permissions.length === 0) return true;
      await hc.requestPermission(permissions);
      return true;
    },
    async granted(read) {
      await initialized();
      const granted = await hc.getGrantedPermissions();
      return granted.some((p) => p.accessType === 'read' && p.recordType === READ_RECORDS[read]);
    },
    async writeWorkout(record) {
      await initialized();
      const [id] = await hc.insertRecords([
        {
          recordType: 'ExerciseSession',
          exerciseType: EXERCISE_STRENGTH_TRAINING,
          title: record.title,
          startTime: iso(record.start),
          endTime: iso(record.end),
          // GymHound's workout id: writing the same workout twice replaces it instead of adding a second session.
          metadata: { clientRecordId: record.workoutId },
        },
      ]);
      if (id === undefined) throw new Error('Health Connect returned no record id.');
      return id;
    },
    async deleteWorkout(recordId) {
      await initialized();
      await hc.deleteRecordsByUuids('ExerciseSession', [recordId], []);
    },
    async readSleep(window) {
      await initialized();
      const { records } = await hc.readRecords('SleepSession', { timeRangeFilter: range(window) });
      const samples: SleepSample[] = [];
      for (const session of records as SleepSession[]) {
        const stages = (session.stages ?? [])
          .map((s) => ({ start: ms(s.startTime), end: ms(s.endTime), kind: sleepStageKind(s.stage) }))
          .filter((s): s is SleepSample => s.kind !== null);
        // A session with no stages is a plain bedtime span: in bed, not known to be asleep.
        if (stages.length > 0) samples.push(...stages);
        else samples.push({ start: ms(session.startTime), end: ms(session.endTime), kind: 'inBed' });
      }
      return samples;
    },
    async readRestingHeartRate(window) {
      await initialized();
      const { records } = await hc.readRecords('RestingHeartRate', { timeRangeFilter: range(window) });
      return (records as RestingHeartRate[]).map((r) => ({ at: ms(r.time), bpm: r.beatsPerMinute }));
    },
    async readLatestBodyweight() {
      await initialized();
      const end = now();
      const { records } = await hc.readRecords('Weight', {
        timeRangeFilter: range({ start: end - BODYWEIGHT_LOOKBACK_MS, end }),
        ascendingOrder: false,
        pageSize: 1,
      });
      const latest = (records as Weight[])[0];
      const kg = latest ? kilograms(latest.weight) : null;
      return latest && kg !== null ? { at: ms(latest.time), kg } : null;
    },
    async readSteps(window) {
      await initialized();
      const result = await hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: range(window) });
      return Math.round(result.COUNT_TOTAL ?? 0);
    },
  };
}
