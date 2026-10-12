import { Platform } from 'react-native';
import { isExpoGo } from '../runtime';

/**
 * PHASE 7: the one gate in front of every native-only package (R306).
 *
 * Expo Go has none of the phase 7 native code (Live Activity, Health, notifee, iCloud), so nothing may load those
 * packages there: some throw as soon as they are required. Each platform module asks `loadOptional` with a function
 * that does the `require`, and gets null (and keeps today's Expo Go behaviour) when:
 * - the app runs in Expo Go, or on the web build;
 * - the package is not installed (Metro bundles a stub with a marker in its place, see metro.config.js; Jest throws);
 * - the require throws (the native side is missing from this build).
 */

/** The environment `loadOptional` checks. Tests pass their own. */
export type NativeEnv = { os: string; expoGo: boolean };

export function nativeEnv(): NativeEnv {
  return { os: Platform.OS, expoGo: isExpoGo() };
}

/** Whether this is a development, preview or store build on a phone, where phase 7 native code can exist. */
export function isNativeBuild(env: NativeEnv = nativeEnv()): boolean {
  return !env.expoGo && (env.os === 'ios' || env.os === 'android');
}

/** Whether a required module is Metro's stand-in for a package that is not installed (missingNativeModule.js). */
export function isMissingNative(module: unknown): boolean {
  return typeof module === 'object' && module !== null && (module as { __gymhoundMissingNative?: unknown }).__gymhoundMissingNative === true;
}

/**
 * The module `load` requires, or null where it cannot be used (see above). `load` runs only in a native build, and
 * only once per call: callers keep what they get.
 */
export function loadOptional<T>(load: () => unknown, env: NativeEnv = nativeEnv()): T | null {
  if (!isNativeBuild(env)) return null;
  try {
    const module = load();
    if (module === null || module === undefined || isMissingNative(module)) return null;
    return module as T;
  } catch (error) {
    // A package that is not installed at all is the expected case under Jest (Metro stubs it in a build): say nothing.
    // Anything else (the JS is there but its native side is not) is worth a line in the log.
    if ((error as { code?: unknown } | null)?.code !== 'MODULE_NOT_FOUND') {
      console.warn('GymHound: a native module is not in this build.', error);
    }
    return null;
  }
}
