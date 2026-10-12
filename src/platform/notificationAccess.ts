import { Platform } from 'react-native';

/**
 * Whether the rest notification may be shown (§18.15, R410). `undetermined` means the phone hasn't asked yet and still
 * can; `denied` means it was refused (or can't be asked again), so only the phone's Settings can turn it on;
 * `unavailable` means there is nothing to ask for here (the web build) or the answer couldn't be read.
 */
export type NotificationAccess = 'granted' | 'denied' | 'undetermined' | 'unavailable';

type Permission = { granted: boolean; status: string; canAskAgain: boolean };

/** The phone's answer in GymHound's words. */
export function accessFrom(permission: Permission): NotificationAccess {
  if (permission.granted) return 'granted';
  if (permission.status === 'undetermined' && permission.canAskAgain) return 'undetermined';
  return 'denied';
}

/** expo-notifications, loaded only on a phone and only when asked about, as the rest timer loads it. */
function notifications(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

async function read(ask: boolean): Promise<NotificationAccess> {
  const module = notifications();
  if (module === null) return 'unavailable';
  try {
    return accessFrom(ask ? await module.requestPermissionsAsync() : await module.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

/** Reads whether the rest notification is allowed, asking nothing. */
export function notificationAccess(): Promise<NotificationAccess> {
  return read(false);
}

/** Shows the phone's question (when it still can) and gives the answer. */
export function askNotificationAccess(): Promise<NotificationAccess> {
  return read(true);
}
