import { loadOptional } from '../native/optional';
import type { RestActivityFactory, RestActivityHandle, RestActivityProps } from './liveActivity';

/**
 * PHASE 7 (iOS build): expo-widgets behind `RestActivityFactory`. The only file that loads the Live Activity
 * (widgets/restTimerActivity.js, which imports `expo-widgets`), and only through `loadOptional`, so Expo Go never does.
 * The types are the slice of expo-widgets 57 GymHound uses, written here because the package is not installed until
 * phase 7. Not unit-tested (Jest has no native module); `liveActivity.ts` is tested against a fake.
 */

/** expo-widgets' `LiveActivity<T>`. */
type LiveActivityLike = {
  update(props: RestActivityProps, staleDate?: Date): Promise<void>;
  end(dismissalPolicy?: 'default' | 'immediate', props?: RestActivityProps): Promise<void>;
};

/** expo-widgets' `LiveActivityFactory<T>`. */
type LiveActivityFactoryLike = {
  start(props: RestActivityProps, url?: string, staleDate?: Date): LiveActivityLike;
  getInstances(): LiveActivityLike[];
};

/** Tapping the activity opens the session. */
const SESSION_URL = 'gymhound://session';

const handleFor = (activity: LiveActivityLike): RestActivityHandle => ({
  update: (props, staleDate) => activity.update(props, staleDate),
  end: () => activity.end('immediate'),
});

/** The Live Activity factory, or null in Expo Go, on Android or the web, or when expo-widgets is not in this build. */
export function loadRestActivityFactory(): RestActivityFactory | null {
  const module = loadOptional<{ default?: LiveActivityFactoryLike }>(() => require('../../../widgets/restTimerActivity'));
  const factory = module?.default;
  if (!factory || typeof factory.start !== 'function') return null;
  // A handle per native activity, kept so `running()` hands back the same handle for the same activity.
  const handles = new Map<LiveActivityLike, RestActivityHandle>();
  const wrap = (activity: LiveActivityLike) => {
    let handle = handles.get(activity);
    if (!handle) {
      handle = handleFor(activity);
      handles.set(activity, handle);
    }
    return handle;
  };
  return {
    start: (props, staleDate) => wrap(factory.start(props, SESSION_URL, staleDate)),
    running: () => factory.getInstances().map(wrap),
  };
}
