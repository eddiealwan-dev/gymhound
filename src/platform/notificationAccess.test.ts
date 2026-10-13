import { Platform } from 'react-native';

// jest.setup stands in for this module everywhere else; here the real one is read.
const actual = jest.requireActual<typeof import('./notificationAccess')>('./notificationAccess');

const mockGet = jest.fn();
const mockRequest = jest.fn();
jest.mock('expo-notifications', () => ({ getPermissionsAsync: () => mockGet(), requestPermissionsAsync: () => mockRequest() }));

const permission = (granted: boolean, status: string, canAskAgain = true) => ({ granted, status, canAskAgain });

beforeEach(() => {
  mockGet.mockReset();
  mockRequest.mockReset();
});

afterEach(() => {
  Platform.OS = 'ios';
});

describe('accessFrom (R410)', () => {
  it('reads granted, a question still to ask, and a refusal', () => {
    expect(actual.accessFrom(permission(true, 'granted'))).toBe('granted');
    expect(actual.accessFrom(permission(false, 'undetermined'))).toBe('undetermined');
    expect(actual.accessFrom(permission(false, 'denied'))).toBe('denied');
  });

  it('treats a question the phone can no longer ask as refused: only Settings can turn it on', () => {
    expect(actual.accessFrom(permission(false, 'undetermined', false))).toBe('denied');
  });
});

describe('notificationAccess and askNotificationAccess (R410)', () => {
  it('reads without asking', async () => {
    mockGet.mockResolvedValue(permission(false, 'undetermined'));
    await expect(actual.notificationAccess()).resolves.toBe('undetermined');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('asks, and gives the answer', async () => {
    mockRequest.mockResolvedValue(permission(true, 'granted'));
    await expect(actual.askNotificationAccess()).resolves.toBe('granted');
  });

  it('says unavailable when the phone will not answer', async () => {
    mockGet.mockRejectedValue(new Error('no module'));
    await expect(actual.notificationAccess()).resolves.toBe('unavailable');
  });

  it('asks nothing on the web', async () => {
    Platform.OS = 'web';
    await expect(actual.notificationAccess()).resolves.toBe('unavailable');
    await expect(actual.askNotificationAccess()).resolves.toBe('unavailable');
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
