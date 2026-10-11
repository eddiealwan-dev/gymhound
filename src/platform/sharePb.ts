import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { PixelRatio, Platform } from 'react-native';
import type { View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

/** The shared image's size in pixels (R106): the 360 × 450 point card at three times. */
const PNG_WIDTH = 1080;
const PNG_HEIGHT = 1350;

/**
 * The size to ask view-shot for. Android reads width and height as pixels; iOS reads them as points and renders at the
 * screen's scale, so it gets the pixel size divided by the scale to come out 1080 × 1350 on any iPhone.
 */
export function pbCaptureSize(): { width: number; height: number } {
  if (Platform.OS !== 'ios') return { width: PNG_WIDTH, height: PNG_HEIGHT };
  const scale = PixelRatio.get();
  return { width: PNG_WIDTH / scale, height: PNG_HEIGHT / scale };
}

/** view-shot's iOS tmpfile result is a bare path; the share sheet needs a file:// URL. A URI with a scheme is kept. */
export function toFileUri(pathOrUri: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(pathOrUri) ? pathOrUri : `file://${pathOrUri}`;
}

/**
 * Captures a mounted personal best card (`PbCard`, 360 × 450 points) as a 1080 × 1350 PNG and opens the share sheet
 * for it (R106). view-shot writes the file to the app's temporary folder and it is released once the share sheet is
 * done with it; nothing is uploaded and nothing is written anywhere else. Phone builds only.
 * - 'unavailable': the phone cannot share; no image is made.
 * - 'shared': the share sheet opened.
 * A failure to capture or to share rejects.
 */
export async function sharePbImage(view: RefObject<View | null>): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const captured = await captureRef(view, { format: 'png', result: 'tmpfile', ...pbCaptureSize() });
  try {
    await Sharing.shareAsync(toFileUri(captured), { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share a personal best' });
  } finally {
    try {
      releaseCapture(captured);
    } catch {
      // already gone; the OS clears its temporary folder anyway
    }
  }
  return 'shared';
}

/** Whether a personal best can be shared: a phone build whose share sheet is available. The browser build never asks. */
export async function canSharePb(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}
