import { Platform } from 'react-native';
import type { StepsSource } from '../domain/steps';
import { stepsSource } from './steps.native';

/**
 * Phase 6 Task 13 (R182): the step counter's adapter. The real `expo-sensors` is never loaded here: Jest has no native
 * module, so the Pedometer is a fake whose answers each test sets.
 */
const mockPedometer = {
  isAvailableAsync: jest.fn<Promise<boolean>, []>(),
  getPermissionsAsync: jest.fn<Promise<{ status: string }>, []>(),
  requestPermissionsAsync: jest.fn<Promise<{ status: string }>, []>(),
  getStepCountAsync: jest.fn<Promise<{ steps: number }>, [Date, Date]>(),
};
jest.mock('expo-sensors', () => ({ Pedometer: mockPedometer }));
// No Health Connect here, as in Expo Go (phase 7 adds it to a build: health/healthSteps.ts, R312).
jest.mock('./health', () => ({ getHealthStore: () => null }));

/** The web (and default) twin, by its file name: Jest resolves `./steps` to the native one, as an iPhone would. */
const webSource = (): StepsSource => (jest.requireActual('./steps.ts') as { stepsSource: () => StepsSource }).stepsSource();

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockPedometer.isAvailableAsync.mockReset().mockResolvedValue(true);
  mockPedometer.getPermissionsAsync.mockReset().mockResolvedValue({ status: 'undetermined' });
  mockPedometer.requestPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
  mockPedometer.getStepCountAsync.mockReset().mockResolvedValue({ steps: 8214 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('on an iPhone', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['undetermined', 'undetermined'],
  ])('says the motion permission %s as %s, without asking', async (status, expected) => {
    mockPedometer.getPermissionsAsync.mockResolvedValue({ status });
    await expect(stepsSource().permission()).resolves.toBe(expected);
    expect(mockPedometer.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks only through request()', async () => {
    await expect(stepsSource().request()).resolves.toBe('granted');
    expect(mockPedometer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('is unavailable on a phone without a step counter, and asks nothing', async () => {
    mockPedometer.isAvailableAsync.mockResolvedValue(false);
    const source = stepsSource();
    await expect(source.permission()).resolves.toBe('unavailable');
    await expect(source.request()).resolves.toBe('unavailable');
    expect(mockPedometer.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPedometer.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('is unavailable, not a throw, when the sensor fails to answer', async () => {
    mockPedometer.isAvailableAsync.mockRejectedValue(new Error('no module'));
    await expect(stepsSource().permission()).resolves.toBe('unavailable');
    mockPedometer.isAvailableAsync.mockResolvedValue(true);
    mockPedometer.requestPermissionsAsync.mockRejectedValue(new Error('boom'));
    await expect(stepsSource().request()).resolves.toBe('unavailable');
  });

  it('reads the steps between two times', async () => {
    const start = new Date(2026, 9, 11);
    const end = new Date(2026, 9, 11, 14, 30);
    await expect(stepsSource().stepsBetween(start, end)).resolves.toBe(8214);
    expect(mockPedometer.getStepCountAsync).toHaveBeenCalledWith(start, end);
  });

  it('passes a failed read on, for the card to say so', async () => {
    mockPedometer.getStepCountAsync.mockRejectedValue(new Error('denied'));
    await expect(stepsSource().stepsBetween(new Date(0), new Date(1))).rejects.toThrow('denied');
  });
});

describe('on Android without Health Connect (Expo Go) and the web', () => {
  it('Android is unavailable and never touches the sensor', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const source = stepsSource();
    await expect(source.permission()).resolves.toBe('unavailable');
    await expect(source.request()).resolves.toBe('unavailable');
    await expect(source.stepsBetween(new Date(0), new Date(1))).rejects.toThrow();
    expect(mockPedometer.isAvailableAsync).not.toHaveBeenCalled();
    expect(mockPedometer.getStepCountAsync).not.toHaveBeenCalled();
  });

  it('the web twin is unavailable and never touches the sensor', async () => {
    const source = webSource();
    await expect(source.permission()).resolves.toBe('unavailable');
    await expect(source.request()).resolves.toBe('unavailable');
    await expect(source.stepsBetween(new Date(0), new Date(1))).rejects.toThrow();
    expect(mockPedometer.isAvailableAsync).not.toHaveBeenCalled();
  });
});
