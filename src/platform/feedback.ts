import { Linking, Platform } from 'react-native';
import { buildStamp } from './buildStamp';

/** Where Send feedback writes to (R570). */
export const FEEDBACK_EMAIL = 'grunthound@gmail.com';
export const FEEDBACK_SUBJECT = 'GymHound feedback';

/**
 * The email's opening (R570): a short prompt for an idea or a bug, then, under a rule, the build and the phone's
 * system, which say which version a bug is in. Nothing else about the phone or the lifter goes in.
 */
export function feedbackBody(build: string | null, system: string): string {
  return [
    'What would make GymHound better, or what went wrong?',
    '',
    'For a bug: what you did, what you expected, and what happened instead.',
    '',
    '',
    '—',
    `${build === null ? 'Build not known' : `Build ${build}`} · ${system}`,
  ].join('\n');
}

/** The mailto: address that opens a new email to GymHound with the subject and the body filled in. */
export function feedbackMailto(build: string | null, system: string): string {
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(feedbackBody(build, system))}`;
}

/** The phone's system as the email names it: "iOS 18.2", "Android 15", "Web". */
function systemName(): string {
  if (Platform.OS === 'ios') return `iOS ${Platform.Version}`;
  if (Platform.OS === 'android') return `Android ${Platform.Version}`;
  return 'Web';
}

/**
 * Opens the phone's mail app with a new email to GymHound (R570). 'unavailable' when no mail app takes it (none set up,
 * or the web without one); then Settings shows the address to write to instead. Never throws.
 */
export async function openFeedbackEmail(): Promise<'opened' | 'unavailable'> {
  const stamp = buildStamp();
  try {
    await Linking.openURL(feedbackMailto(stamp === null ? null : `${stamp.commit} · ${stamp.date}`, systemName()));
    return 'opened';
  } catch {
    return 'unavailable';
  }
}
