import { getLocales } from 'expo-localization';

/** The phone's language and region, for dates and numbers ("3 Aug", or "Aug 3" in en-US); en-US when it has none. */
export const deviceLocale = (): string => getLocales()[0]?.languageTag ?? 'en-US';
