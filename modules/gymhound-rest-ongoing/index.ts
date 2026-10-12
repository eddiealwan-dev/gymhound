// GymHound's Android ongoing rest countdown (R202). Types and the name only: this file loads no
// native code. The module is reached only through `optionalNativeModule<RestOngoingModule>(REST_ONGOING_MODULE)`
// (src/platform/native.ts), which is null on iOS, on the web, in Expo Go and in Jest (R196).

export const REST_ONGOING_MODULE = 'GymHoundRestOngoing';

export type RestOngoingModule = {
  /**
   * Shows the ongoing notification, replacing the one shown: `title` over `text`, with a chronometer
   * counting down to `endsAt` (epoch ms). It removes itself at `endsAt`. Silent; posts nothing without
   * notification permission, and only cancels when `endsAt` has passed.
   */
  show(endsAt: number, title: string, text: string): Promise<void>;
  /** Removes it (Skip, finish, discard, the rest dealt with). */
  hide(): Promise<void>;
};
