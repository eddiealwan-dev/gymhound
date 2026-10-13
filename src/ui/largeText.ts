import { useWindowDimensions } from 'react-native';

/**
 * Above this text size a row of two or more things gives each its own line, or a choice its own width, rather than
 * squeeze words until they break mid-word (R562, Round 13). iOS's Larger Text starts past it; the Text Size slider
 * alone ends at 1.353.
 */
export const STACK_ABOVE_SCALE = 1.3;

/** How far the set table's column headings grow with the text size: as far as the set fields under them (R562). */
export const SET_HEADER_MAX_SCALE = 1.5;

/** Whether the phone's text size is past `STACK_ABOVE_SCALE`. */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale > STACK_ABOVE_SCALE;
}

/**
 * A name a line may break after each slash of ("Push/pull/legs"), as nowhere else in it: at the largest text the whole
 * name was wider than its row and broke mid-word (Round 13). The break is a zero-width space, which VoiceOver doesn't
 * say; spoken labels use the plain name.
 */
export function breakableName(name: string): string {
  return name.replace(/\//g, '/\u200B');
}
