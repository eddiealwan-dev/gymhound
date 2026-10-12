import { createAppleHealthStore, HK, sleepKindOf, TRADITIONAL_STRENGTH_TRAINING, type HealthKitLike } from './appleHealth';
import { createHealthConnectStore, EXERCISE_STRENGTH_TRAINING, sleepStageKind, type HealthConnectLike } from './healthConnect';
import { loadHealthStore } from './index';

const T0 = Date.UTC(2026, 9, 12, 7, 0);
const T1 = Date.UTC(2026, 9, 12, 8, 5);
const RECORD = { workoutId: 'w1', title: 'Push A', start: T0, end: T1 };

function fakeHealthKit(): jest.Mocked<HealthKitLike> {
  return {
    isHealthDataAvailableAsync: jest.fn(async () => true),
    requestAuthorization: jest.fn(async () => true),
    saveWorkoutSample: jest.fn(async () => ({ uuid: 'HK-1' })),
    deleteObjects: jest.fn(async () => 1),
    queryCategorySamples: jest.fn(async () => []),
    queryQuantitySamples: jest.fn(async () => []),
    queryStatisticsForQuantity: jest.fn(async () => ({})),
  } as unknown as jest.Mocked<HealthKitLike>;
}

describe('Apple Health (R307)', () => {
  it('writes a finished workout as a traditional strength training workout with its times and name', async () => {
    const hk = fakeHealthKit();
    await expect(createAppleHealthStore(hk).writeWorkout(RECORD)).resolves.toBe('HK-1');
    expect(hk.saveWorkoutSample).toHaveBeenCalledWith(TRADITIONAL_STRENGTH_TRAINING, [], new Date(T0), new Date(T1), undefined, {
      HKExternalUUID: 'w1',
      HKWorkoutBrandName: 'Push A',
    });
    expect(TRADITIONAL_STRENGTH_TRAINING).toBe(50);
  });

  it('deletes the workout it wrote by its id', async () => {
    const hk = fakeHealthKit();
    await createAppleHealthStore(hk).deleteWorkout('HK-1');
    expect(hk.deleteObjects).toHaveBeenCalledWith(HK.workout, { uuid: 'HK-1' });
  });

  it('asks to write workouts and to read only what is switched on', async () => {
    const hk = fakeHealthKit();
    await createAppleHealthStore(hk).requestAccess({ writeWorkouts: true, reads: ['sleep', 'bodyweight'] });
    expect(hk.requestAuthorization).toHaveBeenCalledWith({ toShare: [HK.workout], toRead: [HK.sleep, HK.bodyMass] });
  });

  it('reads sleep stages as asleep, in bed or awake', async () => {
    const hk = fakeHealthKit();
    hk.queryCategorySamples.mockResolvedValue([
      { uuid: 'a', startDate: new Date(1_000), endDate: new Date(2_000), value: 0 },
      { uuid: 'b', startDate: new Date(2_000), endDate: new Date(3_000), value: 3 },
      { uuid: 'c', startDate: new Date(3_000), endDate: new Date(4_000), value: 2 },
    ]);
    await expect(createAppleHealthStore(hk).readSleep({ start: 0, end: 5_000 })).resolves.toEqual([
      { start: 1_000, end: 2_000, kind: 'inBed' },
      { start: 2_000, end: 3_000, kind: 'asleep' },
      { start: 3_000, end: 4_000, kind: 'awake' },
    ]);
    expect(hk.queryCategorySamples).toHaveBeenCalledWith(HK.sleep, { limit: 0, filter: { date: { startDate: new Date(0), endDate: new Date(5_000) } } });
    expect([0, 1, 2, 3, 4, 5].map(sleepKindOf)).toEqual(['inBed', 'asleep', 'awake', 'asleep', 'asleep', 'asleep']);
  });

  it('reads resting heart rate in beats per minute and the newest body weight in kg', async () => {
    const hk = fakeHealthKit();
    hk.queryQuantitySamples.mockImplementation(async (id) =>
      id === HK.restingHeartRate
        ? [{ uuid: 'r', startDate: new Date(0), endDate: new Date(9_000), quantity: 55 }]
        : [{ uuid: 'w', startDate: new Date(0), endDate: new Date(8_000), quantity: 81.2 }],
    );
    const store = createAppleHealthStore(hk);
    await expect(store.readRestingHeartRate({ start: 0, end: 10_000 })).resolves.toEqual([{ at: 9_000, bpm: 55 }]);
    await expect(store.readLatestBodyweight()).resolves.toEqual({ at: 8_000, kg: 81.2 });
    expect(hk.queryQuantitySamples).toHaveBeenLastCalledWith(HK.bodyMass, { limit: 1, unit: 'kg', ascending: false });
    hk.queryQuantitySamples.mockResolvedValue([]);
    await expect(store.readLatestBodyweight()).resolves.toBeNull();
  });

  it('is unavailable when HealthKit says so or fails to answer', async () => {
    const hk = fakeHealthKit();
    hk.isHealthDataAvailableAsync.mockRejectedValue(new Error('no'));
    await expect(createAppleHealthStore(hk).isAvailable()).resolves.toBe(false);
  });
});

function fakeHealthConnect(): jest.Mocked<HealthConnectLike> {
  return {
    getSdkStatus: jest.fn(async () => 3),
    initialize: jest.fn(async () => true),
    requestPermission: jest.fn(async (p: unknown) => p),
    getGrantedPermissions: jest.fn(async () => [{ accessType: 'read', recordType: 'Steps' }]),
    insertRecords: jest.fn(async () => ['HC-1']),
    deleteRecordsByUuids: jest.fn(async () => {}),
    readRecords: jest.fn(async () => ({ records: [] })),
    aggregateRecord: jest.fn(async () => ({ COUNT_TOTAL: 8214 })),
  } as unknown as jest.Mocked<HealthConnectLike>;
}

describe('Health Connect (R307)', () => {
  it('writes a finished workout as a strength-training exercise session, keyed by the workout id', async () => {
    const hc = fakeHealthConnect();
    await expect(createHealthConnectStore(hc).writeWorkout(RECORD)).resolves.toBe('HC-1');
    expect(hc.insertRecords).toHaveBeenCalledWith([
      {
        recordType: 'ExerciseSession',
        exerciseType: EXERCISE_STRENGTH_TRAINING,
        title: 'Push A',
        startTime: '2026-10-12T07:00:00.000Z',
        endTime: '2026-10-12T08:05:00.000Z',
        metadata: { clientRecordId: 'w1' },
      },
    ]);
    expect(hc.initialize).toHaveBeenCalledTimes(1);
  });

  it('deletes the session it wrote', async () => {
    const hc = fakeHealthConnect();
    await createHealthConnectStore(hc).deleteWorkout('HC-1');
    expect(hc.deleteRecordsByUuids).toHaveBeenCalledWith('ExerciseSession', ['HC-1'], []);
  });

  it('asks for exactly the permissions switched on', async () => {
    const hc = fakeHealthConnect();
    await createHealthConnectStore(hc).requestAccess({ writeWorkouts: true, reads: ['heartRate', 'steps'] });
    expect(hc.requestPermission).toHaveBeenCalledWith([
      { accessType: 'write', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'RestingHeartRate' },
      { accessType: 'read', recordType: 'Steps' },
    ]);
  });

  it('reads sleep stages, and a session with no stages as time in bed', async () => {
    const hc = fakeHealthConnect();
    hc.readRecords.mockResolvedValue({
      records: [
        {
          startTime: '2026-10-11T22:00:00.000Z',
          endTime: '2026-10-12T06:00:00.000Z',
          stages: [
            { startTime: '2026-10-11T22:00:00.000Z', endTime: '2026-10-12T02:00:00.000Z', stage: 4 },
            { startTime: '2026-10-12T02:00:00.000Z', endTime: '2026-10-12T02:30:00.000Z', stage: 1 },
            { startTime: '2026-10-12T02:30:00.000Z', endTime: '2026-10-12T03:00:00.000Z', stage: 0 },
          ],
        },
        { startTime: '2026-10-10T22:00:00.000Z', endTime: '2026-10-11T05:00:00.000Z' },
      ],
    });
    const samples = await createHealthConnectStore(hc).readSleep({ start: 0, end: T1 });
    expect(samples).toEqual([
      { start: Date.parse('2026-10-11T22:00:00.000Z'), end: Date.parse('2026-10-12T02:00:00.000Z'), kind: 'asleep' },
      { start: Date.parse('2026-10-12T02:00:00.000Z'), end: Date.parse('2026-10-12T02:30:00.000Z'), kind: 'awake' },
      { start: Date.parse('2026-10-10T22:00:00.000Z'), end: Date.parse('2026-10-11T05:00:00.000Z'), kind: 'inBed' },
    ]);
    expect([0, 1, 2, 3, 4, 5, 6].map(sleepStageKind)).toEqual([null, 'awake', 'asleep', 'awake', 'asleep', 'asleep', 'asleep']);
  });

  it('reads resting heart rate, the newest weight and the day’s steps', async () => {
    const hc = fakeHealthConnect();
    hc.readRecords.mockImplementation(async (type) => ({
      records:
        type === 'RestingHeartRate'
          ? [{ time: '2026-10-12T06:00:00.000Z', beatsPerMinute: 58 }]
          : [{ time: '2026-10-12T06:30:00.000Z', weight: { inKilograms: 80.5, inPounds: 177.5 } }],
    }));
    const store = createHealthConnectStore(hc, () => T1);
    await expect(store.readRestingHeartRate({ start: 0, end: T1 })).resolves.toEqual([{ at: Date.parse('2026-10-12T06:00:00.000Z'), bpm: 58 }]);
    await expect(store.readLatestBodyweight()).resolves.toEqual({ at: Date.parse('2026-10-12T06:30:00.000Z'), kg: 80.5 });
    expect(hc.readRecords).toHaveBeenLastCalledWith('Weight', expect.objectContaining({ ascendingOrder: false, pageSize: 1 }));
    await expect(store.readSteps({ start: 0, end: T1 })).resolves.toBe(8214);
  });

  it('says which reads were allowed', async () => {
    const store = createHealthConnectStore(fakeHealthConnect());
    await expect(store.granted('steps')).resolves.toBe(true);
    await expect(store.granted('sleep')).resolves.toBe(false);
    await expect(createAppleHealthStore(fakeHealthKit()).granted('sleep')).resolves.toBeNull();
  });

  it('is unavailable when Health Connect is missing or needs an update', async () => {
    const hc = fakeHealthConnect();
    hc.getSdkStatus.mockResolvedValue(2);
    await expect(createHealthConnectStore(hc).isAvailable()).resolves.toBe(false);
    expect(hc.initialize).not.toHaveBeenCalled();
  });

  it('refuses to write when it cannot initialize, and tries again next time', async () => {
    const hc = fakeHealthConnect();
    hc.initialize.mockResolvedValueOnce(false);
    const store = createHealthConnectStore(hc);
    await expect(store.writeWorkout(RECORD)).rejects.toThrow('not available');
    await expect(store.writeWorkout(RECORD)).resolves.toBe('HC-1');
  });
});

describe('loadHealthStore (R306)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('is nothing in Expo Go or on the web', () => {
    expect(loadHealthStore({ os: 'ios', expoGo: true })).toBeNull();
    expect(loadHealthStore({ os: 'android', expoGo: true })).toBeNull();
    expect(loadHealthStore({ os: 'web', expoGo: false })).toBeNull();
  });

  it('is nothing in a build without the package (not installed here)', () => {
    expect(loadHealthStore({ os: 'ios', expoGo: false })).toBeNull();
    expect(loadHealthStore({ os: 'android', expoGo: false })).toBeNull();
  });
});

describe('Android steps from Health Connect (R312)', () => {
  const { healthConnectSteps } = require('./healthSteps') as typeof import('./healthSteps');
  const store = () => createHealthConnectStore(fakeHealthConnect());

  it('reads the steps between two times', async () => {
    await expect(healthConnectSteps(store()).stepsBetween(new Date(0), new Date(T1))).resolves.toBe(8214);
  });

  it('is granted once Steps may be read, and asks only through request()', async () => {
    const hc = fakeHealthConnect();
    const source = healthConnectSteps(createHealthConnectStore(hc));
    await expect(source.permission()).resolves.toBe('granted');
    expect(hc.requestPermission).not.toHaveBeenCalled();
    await expect(source.request()).resolves.toBe('granted');
    expect(hc.requestPermission).toHaveBeenCalledWith([{ accessType: 'read', recordType: 'Steps' }]);
  });

  it('reads a refused read as not yet asked, and a refused request as denied', async () => {
    const hc = fakeHealthConnect();
    hc.getGrantedPermissions.mockResolvedValue([]);
    const source = healthConnectSteps(createHealthConnectStore(hc));
    await expect(source.permission()).resolves.toBe('undetermined');
    await expect(source.request()).resolves.toBe('denied');
  });

  it('is unavailable without Health Connect', async () => {
    const hc = fakeHealthConnect();
    hc.getSdkStatus.mockResolvedValue(1);
    await expect(healthConnectSteps(createHealthConnectStore(hc)).permission()).resolves.toBe('unavailable');
  });
});
