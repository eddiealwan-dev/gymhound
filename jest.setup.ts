jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));
// Settings → Rest timer reads the notification permission when it mounts (R410). Every screen test that draws Settings
// would otherwise load expo-notifications, which warns that it isn't in Expo Go. Its own test reads the real module.
jest.mock('./src/platform/notificationAccess', () => ({
  ...jest.requireActual('./src/platform/notificationAccess'),
  notificationAccess: jest.fn(async () => 'unavailable'),
  askNotificationAccess: jest.fn(async () => 'unavailable'),
}));
