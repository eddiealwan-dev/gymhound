import { getLocales } from 'expo-localization';

/**
 * A language tag `Intl` accepts, or null. Some systems report a POSIX suffix ("en-US@posix") or an underscore
 * ("en_US"), which `Intl` rejects with a RangeError that would take down every screen that shows a date or number.
 */
export function usableLocale(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const cleaned = tag.split('@')[0].replace(/_/g, '-');
  try {
    return Intl.getCanonicalLocales(cleaned)[0] ?? null;
  } catch {
    return null;
  }
}

/** The phone's language and region, for dates and numbers ("3 Aug", or "Aug 3" in en-US); en-US when it has none. */
export const deviceLocale = (): string => usableLocale(getLocales()[0]?.languageTag) ?? 'en-US';
