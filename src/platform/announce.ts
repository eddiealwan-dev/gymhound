import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Tells VoiceOver or TalkBack something that happened without moving its focus: a logged set, the end of a rest. The
 * web has no such call, so it does nothing there, and a screen reader that cannot be told never fails the action.
 */
export function announce(text: string): void {
  if (Platform.OS === 'web') return;
  try {
    AccessibilityInfo.announceForAccessibility(text);
  } catch {
    // no screen reader to tell
  }
}
