import { AccessibilityInfo, Platform } from 'react-native';

/**
 * How long iOS waits before it speaks. VoiceOver reads the control that was just tapped again (a tick that is now
 * checked), which can cut off an announcement made in the same moment (B9).
 */
const IOS_DELAY_MS = 500;

function tell(text: string): void {
  try {
    AccessibilityInfo.announceForAccessibility(text);
  } catch {
    // no screen reader to tell
  }
}

/**
 * Tells VoiceOver or TalkBack something that happened without moving its focus: a logged set, the end of a rest. On
 * iOS it is said half a second later, so VoiceOver re-reading the tapped control does not cut it off. The web has no
 * such call, so it does nothing there, and a screen reader that cannot be told never fails the action.
 */
export function announce(text: string): void {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'ios') setTimeout(() => tell(text), IOS_DELAY_MS);
  else tell(text);
}

/**
 * Moves VoiceOver or TalkBack to `node` (a sheet's new title, say). React Native Web has no sendAccessibilityEvent, so
 * calling it there threw and blanked the app; on the web this does nothing, and a missing or failing call never fails
 * the action.
 */
export function focusOn(node: Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0] | null | undefined): void {
  if (Platform.OS === 'web' || !node) return;
  if (typeof AccessibilityInfo.sendAccessibilityEvent !== 'function') return;
  try {
    AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  } catch {
    // no screen reader to move
  }
}
