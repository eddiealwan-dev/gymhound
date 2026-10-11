import type { ReactElement } from 'react';

/**
 * What GymHound Pro adds, with Unlock and Restore (§8.12, R137). `screen` is the full-screen paywall; `tab` sits inside
 * a locked Fuel tab (R151). `onDone` runs once Pro is on, or when the paywall is left.
 * A stub until Task 7 fills it; Task 7 keeps these props.
 */
export function ProPitch(_props: { context: 'screen' | 'tab'; onDone?: () => void }): ReactElement | null {
  return null;
}
