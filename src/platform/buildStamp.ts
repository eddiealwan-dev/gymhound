import Constants from 'expo-constants';

export type BuildStamp = { commit: string; date: string };

/**
 * The commit this build was started from and its date (R540), as app.config.js put it in `extra.build`; null when it
 * isn't there (no git where Expo started) or isn't well formed.
 */
export function buildStamp(): BuildStamp | null {
  const build: unknown = (Constants.expoConfig?.extra as { build?: unknown } | undefined)?.build;
  if (typeof build !== 'object' || build === null) return null;
  const { commit, date } = build as { commit?: unknown; date?: unknown };
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { commit, date };
}
